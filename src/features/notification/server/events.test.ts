import { beforeEach, describe, expect, test } from "vitest";
import { cancelOrderGroup } from "@/features/checkout/server/buyer-orders";
import { getCheckout, placeOrder } from "@/features/checkout/server/checkout";
import { expireOverdueOrderGroups } from "@/features/checkout/server/order-groups";
import { changeParcelStatus, type StatusChanger } from "@/features/delivery/server/parcel-status";
import { completeDueReceipts, confirmReceipt } from "@/features/delivery/server/receipt";
import { handleChargeNotification, payByCard, payByPromptPay } from "@/features/payment/server/payments";
import { createSimulator } from "@/features/payment/server/simulator";
import { setStock } from "@/features/stock/server/stock";
import type { Db } from "@/shared/db";
import { addAccount, addAddress, addCartItem, addProduct, addShop } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";
import { PARCEL_STATUS, type ParcelStatus } from "@/shared/statuses";
import { notifyNewReview, notifyReviewHidden, notifyReviewReplied } from "./events";
import { NOTIFICATION_TYPE } from "./notifications";

// ใช้คนชุดเดียวกับตัวอย่างใน notification.md และเดินผ่านกฎจริงของการสั่งซื้อ จ่ายเงิน และจัดส่ง

/** 2026-11-26 เวลาประเทศไทย เช่น at("14:09") หรือ at("14:09:04") */
const at = (time: string, day = "2026-11-26") => new Date(`${day}T${time.length === 5 ? `${time}:00` : time}+07:00`);

const GOOD_CARD = { number: "4242424242424242", name: "SOMYING JAIDEE", expiry: "12/30", securityCode: "123" };
const BAD_CARD = { ...GOOD_CARD, number: "4111111111140011" };

type World = ReturnType<typeof createWorld>;

/** สมหญิงกับมานีเป็นผู้ซื้อ สมชายกับมานะเป็นผู้ขาย วิชัยเป็นผู้ดูแลแพลตฟอร์ม ราคารวมค่าส่ง 40 บาทได้ 290 กับ 160 บาท */
function createWorld(db: Db) {
  const person = (displayName: string, isAdmin = false) => {
    const id = addAccount(db, { displayName, isAdmin }).id;
    addAddress(db, { accountId: id, isDefault: true });
    return id;
  };
  const somying = person("สมหญิง");
  const manee = person("มานี");
  const wichai = person("วิชัย", true);
  const somchai = person("สมชาย");
  const mana = person("มานะ");
  const toolShop = addShop(db, { ownerAccountId: somchai, name: "สมชายการช่าง" }).id;
  const sportShop = addShop(db, { ownerAccountId: mana, name: "มานะสปอร์ต" }).id;
  return {
    somying,
    manee,
    wichai,
    somchai,
    mana,
    toolShop,
    sportShop,
    somchaiActor: { id: somchai, isAdmin: false, shopId: toolShop },
    wichaiActor: { id: wichai, isAdmin: true, shopId: null },
    screwdriver: addProduct(db, { shopId: toolShop, name: "ไขควง", price: 250, stock: 50 }).variantIds[0],
    football: addProduct(db, { shopId: sportShop, name: "ลูกฟุตบอล", price: 120, stock: 50 }).variantIds[0],
  };
}

type PlacedOrder = { groupId: number; orders: { id: number; orderNo: string; total: number }[] };

/** สั่งซื้อผ่านกฎจริง สต็อกถูกจองจริง */
function order(db: Db, buyerId: number, lines: [variantId: number, quantity: number][], now: Date): PlacedOrder {
  for (const [variantId, quantity] of lines) addCartItem(db, { accountId: buyerId, variantId, quantity });
  // กุญแจกันสั่งซ้ำ (CHK-007) คิดจากเวลาที่ใส่ตะกร้า สองคำสั่งซื้อของ test ต้องไม่ได้เวลาเดียวกัน
  db.prepare("UPDATE cart_items SET added_at = ? WHERE account_id = ?").run(now.toISOString(), buyerId);
  const checkout = getCheckout(db, buyerId);
  const placed = placeOrder(
    db,
    {
      buyerAccountId: buyerId,
      addressId: checkout.addresses[0].id,
      orderKey: checkout.orderKey,
      lines: checkout.shops.flatMap((shop) =>
        shop.lines.map((line) => ({ cartItemId: line.cartItemId, quantity: line.quantity, unitPrice: line.unitPrice ?? 0 })),
      ),
    },
    now,
  );
  if (!placed.ok || placed.duplicate) throw new Error(`สั่งซื้อไม่ได้ ${JSON.stringify(placed)}`);
  const orders = db.prepare("SELECT id, order_no AS orderNo, total FROM orders WHERE group_id = ? ORDER BY id").all(placed.groupId);
  return { groupId: placed.groupId, orders: orders as PlacedOrder["orders"] };
}

type Note = { id: number; type: string; message: string; href: string; created_at: string; read_at: string | null };

/** แจ้งเตือนของบัญชีตามลำดับที่เกิด */
function notesOf(db: Db, accountId: number): Note[] {
  return db.prepare("SELECT id, type, message, href, created_at, read_at FROM notifications WHERE account_id = ? ORDER BY id").all(accountId) as Note[];
}

const trackingNoOf = (db: Db, orderId: number) => String(db.prepare("SELECT tracking_no FROM parcels WHERE order_id = ?").get(orderId)?.tracking_no);

let db: Db;
let w: World;
const sim = createSimulator();

beforeEach(() => {
  db = createTestDb();
  w = createWorld(db);
});

const messages = (accountId: number) => notesOf(db, accountId).map((note) => note.message);
const totalNotes = () => Number(db.prepare("SELECT count(*) AS n FROM notifications").get()?.n);

const pay = (buyerId: number, groupId: number, now: Date, card = GOOD_CARD) => payByCard(db, sim, { buyerId, groupId, card }, now);

function move(trackingNo: string, actor: StatusChanger, from: ParcelStatus, to: ParcelStatus, now: Date, fields: { reason?: string } = {}) {
  return changeParcelStatus(
    db,
    { trackingNo, actor, from, to, location: "ไปรษณีย์", province: "กรุงเทพมหานคร", receiverName: "สมหญิง", reason: "ไม่มีคนรับ โทรไม่ติด 2 ครั้ง", ...fields },
    now,
  );
}

const S = PARCEL_STATUS;
const STEPS: ParcelStatus[] = [S.awaitingPacking, S.handedOver, S.inTransit, S.outForDelivery, S.delivered];

/** สมหญิงสั่งของหนึ่งชิ้นจากสมชาย จ่ายแล้ว แล้วสมชายเปลี่ยนสถานะทีละขั้นจนถึง upTo */
async function paidOrder(upTo: ParcelStatus = S.awaitingPacking, day = "2026-11-26", variantId = w.screwdriver) {
  const placed = order(db, w.somying, [[variantId, 1]], at("09:00", day));
  await pay(w.somying, placed.groupId, at("09:05", day));
  const trackingNo = trackingNoOf(db, placed.orders[0].id);
  for (let step = 1; step <= STEPS.indexOf(upTo); step++) {
    expect(move(trackingNo, w.somchaiActor, STEPS[step - 1], STEPS[step], at(`1${step}:00`, day))).toEqual({ ok: true });
  }
  return { ...placed.orders[0], groupId: placed.groupId, trackingNo };
}

describe("NTF-006 แจ้งผู้ซื้อเรื่องการจ่ายเงิน", () => {
  test("NTF-006 จ่ายด้วยบัตรไม่ผ่านแล้วจ่ายสำเร็จ ได้ 2 รายการ พร้อมยอด เวลาหมดเขต และจำนวนคำสั่งซื้อ ที่พาไปหน้าจ่ายเงิน", async () => {
    const placed = order(db, w.somying, [[w.screwdriver, 1], [w.football, 1]], at("14:00"));

    await pay(w.somying, placed.groupId, at("14:07"), BAD_CARD);
    await pay(w.somying, placed.groupId, at("14:09"));

    // เวลาของผลการจ่ายเงินรวมเวลาที่รอผู้ให้บริการตอบ จึงเทียบถึงนาที
    expect(notesOf(db, w.somying).map((note) => [note.message, note.created_at.slice(0, 16), note.href, note.read_at])).toEqual([
      ["จ่ายเงินไม่สำเร็จ ฿450 จ่ายใหม่ได้ถึง 14:30", "2026-11-26T07:07", `/pay/${placed.groupId}`, null],
      ["จ่ายเงินสำเร็จ ฿450 สำหรับ 2 คำสั่งซื้อ", "2026-11-26T07:09", `/pay/${placed.groupId}`, null],
    ]);
  });

  test("NTF-006 หมดเวลาจ่ายเงินได้ 1 รายการต่อกลุ่ม ไม่ใช่ต่อคำสั่งซื้อ และผู้ซื้อที่ยกเลิกเองไม่ได้แจ้งเตือน", () => {
    order(db, w.manee, [[w.screwdriver, 1], [w.football, 3]], at("14:00"));
    const own = order(db, w.somying, [[w.football, 1]], at("14:10"));
    expect(cancelOrderGroup(db, { buyerAccountId: w.somying, orderNo: own.orders[0].orderNo }, at("14:20"))).toEqual({ ok: true });

    expireOverdueOrderGroups(db, at("14:30"));
    expireOverdueOrderGroups(db, at("14:31"));

    expect(notesOf(db, w.manee).map((note) => [note.message, note.href, note.created_at])).toEqual([
      ["หมดเวลาจ่ายเงิน คำสั่งซื้อ 2 รายการถูกยกเลิก", `/orders?status=${encodeURIComponent("ยกเลิก")}`, at("14:30").toISOString()],
    ]);
    expect(messages(w.somying)).toEqual([]);
  });
});

describe("NTF-007 แจ้งผู้ซื้อเมื่อสถานะการจัดส่งเปลี่ยน", () => {
  test("NTF-007 เปลี่ยน 4 ขั้นได้ 4 รายการ รายการละสถานะ ผู้ดูแลแพลตฟอร์มเปลี่ยนก็ได้เหมือนกัน และส่งสำเร็จมีข้อความต่อท้าย", async () => {
    const parcel = await paidOrder(S.inTransit);
    expect(move(parcel.trackingNo, w.wichaiActor, S.inTransit, S.outForDelivery, at("15:00"))).toEqual({ ok: true });
    expect(move(parcel.trackingNo, w.somchaiActor, S.outForDelivery, S.delivered, at("15:30"))).toEqual({ ok: true });

    const notes = notesOf(db, w.somying).filter((note) => note.type === NOTIFICATION_TYPE.parcelStatus);
    expect(notes.map((note) => note.message)).toEqual([
      `พัสดุ ${parcel.trackingNo} จากร้าน สมชายการช่าง เป็น ร้านส่งของแล้ว`,
      `พัสดุ ${parcel.trackingNo} จากร้าน สมชายการช่าง เป็น อยู่ระหว่างขนส่ง`,
      `พัสดุ ${parcel.trackingNo} จากร้าน สมชายการช่าง เป็น กำลังนำส่ง`,
      `พัสดุ ${parcel.trackingNo} จากร้าน สมชายการช่าง เป็น ส่งสำเร็จ กดได้รับสินค้าแล้วเมื่อได้ของ`,
    ]);
    expect(new Set(notes.map((note) => note.href))).toEqual(new Set([`/track/${parcel.trackingNo}`]));
    expect(notes.at(-1)?.created_at).toBe(at("15:30").toISOString());
    // พัสดุที่เพิ่งเกิดที่ รอร้านจัดของ ไม่มีแจ้งเตือนแยก มีแค่จ่ายเงินสำเร็จ
    expect(notesOf(db, w.somying)).toHaveLength(5);
  });

  test("NTF-007 กดเปลี่ยนซ้ำจากสองหน้าต่างได้ 1 รายการ และคำขอข้ามขั้นที่ถูกปฏิเสธไม่มีแจ้งเตือน", async () => {
    const parcel = await paidOrder();

    expect(move(parcel.trackingNo, w.somchaiActor, S.awaitingPacking, S.handedOver, at("10:00:00")).ok).toBe(true);
    expect(move(parcel.trackingNo, w.somchaiActor, S.awaitingPacking, S.handedOver, at("10:00:02")).ok).toBe(false);
    expect(move(parcel.trackingNo, w.somchaiActor, S.handedOver, S.delivered, at("10:01")).ok).toBe(false);

    expect(messages(w.somying).slice(1)).toEqual([`พัสดุ ${parcel.trackingNo} จากร้าน สมชายการช่าง เป็น ร้านส่งของแล้ว`]);
  });
});

describe("NTF-008 แจ้งผู้ซื้อเมื่อคำสั่งซื้อถูกยกเลิก", () => {
  test("NTF-008 ส่งไม่สำเร็จได้แจ้งเตือนคำสั่งซื้อถูกยกเลิกรายการเดียว ที่พาไปหน้ารายละเอียดคำสั่งซื้อ", async () => {
    const parcel = await paidOrder(S.outForDelivery);
    const before = notesOf(db, w.somying).length;

    expect(move(parcel.trackingNo, w.somchaiActor, S.outForDelivery, S.failed, at("16:00"))).toEqual({ ok: true });

    expect(notesOf(db, w.somying).slice(before).map((note) => [note.type, note.message, note.href])).toEqual([
      [NOTIFICATION_TYPE.orderCancelled, `คำสั่งซื้อ ${parcel.orderNo} จากร้าน สมชายการช่าง ถูกยกเลิก เพราะส่งไม่สำเร็จ`, `/orders/${parcel.orderNo}`],
    ]);
  });

  test("NTF-008 บันทึกส่งไม่สำเร็จโดยเว้นเหตุผลว่างถูกปฏิเสธ ไม่มีแจ้งเตือนใหม่", async () => {
    const parcel = await paidOrder(S.outForDelivery);
    const before = notesOf(db, w.somying).length;

    expect(move(parcel.trackingNo, w.somchaiActor, S.outForDelivery, S.failed, at("15:55"), { reason: " " }).ok).toBe(false);

    expect(notesOf(db, w.somying)).toHaveLength(before);
  });
});

const REVIEW_PAGE = "/orders/2611200012/review/1";
const SHOP_REVIEWS = "/seller/reviews?review=7";

const replyToReview = (now: Date) =>
  notifyReviewReplied(db, { reviewId: 7, buyerAccountId: w.somying, shopName: "สมชายการช่าง", productName: "ไขควง", href: REVIEW_PAGE }, now);
const hideReview = (now: Date) =>
  notifyReviewHidden(db, { reviewId: 7, buyerAccountId: w.somying, productName: "ไขควง", reason: "ใช้คำหยาบ", href: REVIEW_PAGE }, now);
const newReview = (rating: number, now: Date) =>
  notifyNewReview(db, { reviewId: 7, shopId: w.toolShop, productName: "ไขควง", rating, href: SHOP_REVIEWS }, now);

describe("NTF-009 แจ้งผู้ซื้อเรื่องรีวิวของตัวเอง", () => {
  test("NTF-009 ร้านตอบรีวิวครั้งแรกและผู้ดูแลแพลตฟอร์มซ่อนรีวิว ผู้ซื้อได้ 2 รายการที่พาไปหน้าเขียนรีวิวของรายการนั้น", () => {
    replyToReview(at("19:10"));
    hideReview(at("20:00"));

    expect(notesOf(db, w.somying).map((note) => [note.type, note.message, note.href, note.created_at])).toEqual([
      [NOTIFICATION_TYPE.reviewReplied, "ร้าน สมชายการช่าง ตอบรีวิว ไขควง ของคุณ", REVIEW_PAGE, at("19:10").toISOString()],
      [NOTIFICATION_TYPE.reviewHidden, "รีวิว ไขควง ของคุณถูกซ่อนโดยผู้ดูแลแพลตฟอร์ม เหตุผล: ใช้คำหยาบ", REVIEW_PAGE, at("20:00").toISOString()],
    ]);
    expect(totalNotes()).toBe(2);
  });

  test("NTF-009 เรียกซ้ำกับรีวิวเดิม เช่นร้านแก้คำตอบ หรือซ่อนอีกครั้งหลังเลิกซ่อน ไม่ได้รายการใหม่", () => {
    replyToReview(at("19:10"));
    hideReview(at("20:00"));

    replyToReview(at("19:15"));
    hideReview(at("20:40"));

    expect(notesOf(db, w.somying).map((note) => note.created_at)).toEqual([at("19:10").toISOString(), at("20:00").toISOString()]);
  });
});

describe("NTF-010 แจ้งผู้ขายเมื่อมีคำสั่งซื้อใหม่ที่จ่ายแล้ว", () => {
  test("NTF-010 กลุ่มคำสั่งซื้อของ 2 ร้าน ผู้ขายแต่ละร้านได้ 1 รายการของคำสั่งซื้อร้านตัวเอง ไม่เห็นยอดของอีกร้าน", async () => {
    const placed = order(db, w.somying, [[w.screwdriver, 1], [w.football, 1]], at("09:15"));
    const [tool, sport] = placed.orders;

    await pay(w.somying, placed.groupId, at("09:20"));

    expect(notesOf(db, w.somchai).map((note) => [note.message, note.href])).toEqual([
      [`ร้านของฉัน: คำสั่งซื้อใหม่ ${tool.orderNo} ยอด ฿290 รอจัดของ`, `/seller/orders/${tool.orderNo}`],
    ]);
    expect(notesOf(db, w.mana).map((note) => [note.message, note.href])).toEqual([
      [`ร้านของฉัน: คำสั่งซื้อใหม่ ${sport.orderNo} ยอด ฿160 รอจัดของ`, `/seller/orders/${sport.orderNo}`],
    ]);
  });

  test("NTF-010 คำสั่งซื้อที่จ่ายไม่ผ่านแล้วหมดเวลา ผู้ขายไม่มีแจ้งเตือนทั้งตอนสั่ง ตอนจ่ายไม่ผ่าน และตอนถูกยกเลิก", async () => {
    const placed = order(db, w.manee, [[w.screwdriver, 1]], at("09:00"));
    await pay(w.manee, placed.groupId, at("09:10"), BAD_CARD);
    expireOverdueOrderGroups(db, at("09:30"));

    expect(messages(w.somchai)).toEqual([]);
    expect(messages(w.manee)).toHaveLength(2);
  });
});

describe("NTF-011 แจ้งผู้ขายเมื่อคำสั่งซื้อสำเร็จ", () => {
  const completed = () => notesOf(db, w.somchai).filter((note) => note.type === NOTIFICATION_TYPE.shopOrderCompleted);

  test("NTF-011 ผู้ซื้อกดได้รับสินค้าแล้ว ผู้ขายได้ 1 รายการ กดซ้ำและครบ 7 วันไม่ได้รายการที่สอง", async () => {
    const parcel = await paidOrder(S.delivered);
    const buyer = { id: w.somying, isAdmin: false, shopId: null };

    expect(confirmReceipt(db, parcel.trackingNo, buyer, at("18:00"))).toEqual({ ok: true });
    expect(confirmReceipt(db, parcel.trackingNo, buyer, at("18:06")).ok).toBe(false);
    completeDueReceipts(db, at("15:30", "2026-12-03"));

    expect(completed().map((note) => [note.message, note.href, note.created_at])).toEqual([
      [`ร้านของฉัน: ผู้ซื้อยืนยันรับสินค้าของคำสั่งซื้อ ${parcel.orderNo} แล้ว`, `/seller/orders/${parcel.orderNo}`, at("18:00").toISOString()],
    ]);
  });

  test("NTF-011 ผู้ซื้อไม่กดจนครบ 7 วัน ผู้ขายได้ข้อความว่าระบบยืนยันให้ รายการเดียว", async () => {
    const parcel = await paidOrder(S.delivered);

    completeDueReceipts(db, at("13:59", "2026-12-03"));
    expect(completed()).toEqual([]);
    completeDueReceipts(db, at("14:00", "2026-12-03"));
    completeDueReceipts(db, at("14:01", "2026-12-03"));

    expect(completed().map((note) => note.message)).toEqual([
      `ร้านของฉัน: คำสั่งซื้อ ${parcel.orderNo} สำเร็จ ระบบยืนยันรับสินค้าให้เพราะครบ 7 วัน`,
    ]);
  });
});

describe("NTF-012 แจ้งผู้ขายเมื่อมีรีวิวใหม่", () => {
  test("NTF-012 รีวิวครั้งแรกของสินค้าในร้าน ผู้ขายเจ้าของร้านได้ 1 รายการที่พาไปหน้ารีวิวของร้าน", () => {
    newReview(4, at("18:10"));

    expect(notesOf(db, w.somchai).map((note) => [note.type, note.message, note.href])).toEqual([
      [NOTIFICATION_TYPE.shopNewReview, "ร้านของฉัน: รีวิวใหม่ 4 ดาว ของ ไขควง", SHOP_REVIEWS],
    ]);
    expect(totalNotes()).toBe(1);
  });

  test("NTF-012 เรียกซ้ำกับรีวิวเดิม เช่นผู้ซื้อแก้รีวิวเป็น 2 ดาว ไม่ได้รายการใหม่ และข้อความเดิมไม่เปลี่ยน", () => {
    newReview(4, at("18:10"));

    newReview(2, at("09:00", "2026-11-28"));

    expect(messages(w.somchai)).toEqual(["ร้านของฉัน: รีวิวใหม่ 4 ดาว ของ ไขควง"]);
  });
});

describe("NTF-013 แจ้งผู้ขายเมื่อสต็อกของแบบย่อยเหลือ 0", () => {
  const stockNotes = () => notesOf(db, w.mana).filter((note) => note.type === NOTIFICATION_TYPE.shopStockEmpty);
  const shoes = (stock: number) =>
    addProduct(db, {
      shopId: w.sportShop,
      name: "รองเท้าวิ่ง",
      price: 900,
      options: [
        { name: "สี", values: ["สีดำ", "สีขาว"] },
        { name: "ขนาด", values: ["ขนาด 42"] },
      ],
      stock,
    }).variantIds;

  test("NTF-013 ผู้ซื้อสั่งจนแบบย่อยเหลือ 0 ผู้ขายได้ 1 รายการที่บอกชื่อสินค้าและแบบย่อย และพาไปหน้าสต็อกที่กรองหมด", () => {
    const [black] = shoes(2);

    order(db, w.manee, [[black, 2]], at("11:02"));

    expect(stockNotes().map((note) => [note.message, note.href, note.created_at])).toEqual([
      ["ร้านของฉัน: รองเท้าวิ่ง สีดำ ขนาด 42 สต็อกเหลือ 0 ชิ้น", "/seller/stock?filter=out", at("11:02").toISOString()],
    ]);
  });

  test("NTF-013 สั่งแล้วเหลือ 5 ชิ้น และผู้ขายตั้งสต็อกเป็น 0 เอง ไม่มีแจ้งเตือน", () => {
    const [black] = shoes(6);

    order(db, w.manee, [[black, 1]], at("11:10"));
    expect(setStock(db, w.sportShop, { variantId: w.football, expected: 50, value: "0" }, at("11:15")).outcome).toBe("saved");

    expect(messages(w.mana)).toEqual([]);
  });

  test("NTF-013 คำสั่งซื้อเดียวทำให้ 2 แบบย่อยเหลือ 0 ได้ 2 รายการ และแบบย่อยที่ได้สต็อกคืนแล้วเหลือ 0 อีกครั้งได้รายการใหม่", () => {
    const [black, white] = shoes(1);

    order(db, w.manee, [[black, 1], [white, 1]], at("11:00"));
    expect(stockNotes().map((note) => note.message)).toEqual([
      "ร้านของฉัน: รองเท้าวิ่ง สีดำ ขนาด 42 สต็อกเหลือ 0 ชิ้น",
      "ร้านของฉัน: รองเท้าวิ่ง สีขาว ขนาด 42 สต็อกเหลือ 0 ชิ้น",
    ]);

    expireOverdueOrderGroups(db, at("11:30"));
    order(db, w.somying, [[black, 1]], at("12:00"));

    expect(stockNotes()).toHaveLength(3);
  });
});

describe("NTF-016 หนึ่งเหตุการณ์หนึ่งแจ้งเตือน และเฉพาะบัญชีที่เกี่ยวข้อง", () => {
  test("NTF-016 NTF-Q04 Omise แจ้งผลสำเร็จของการจ่ายเงินเดียวกัน 2 ครั้ง 10 รอบ ได้รอบละ 3 รายการ ผู้ซื้อ 1 ผู้ขายร้านละ 1 คนอื่น 0", async () => {
    for (let round = 1; round <= 10; round++) {
      const day = `2026-11-${10 + round}`;
      const placed = order(db, w.somying, [[w.screwdriver, 1], [w.football, 1]], at("14:00", day));
      await payByPromptPay(db, sim, { buyerId: w.somying, groupId: placed.groupId }, at("14:05", day));
      const chargeId = String(db.prepare("SELECT omise_charge_id AS id FROM payments WHERE group_id = ?").get(placed.groupId)?.id);
      sim.mark(chargeId, "successful");

      expect(await handleChargeNotification(db, sim, { chargeId, amount: 450 }, at("14:09:00", day))).toBe("applied");
      expect(await handleChargeNotification(db, sim, { chargeId, amount: 450 }, at("14:09:04", day))).toBe("already-used");

      expect([w.somying, w.somchai, w.mana, w.manee, w.wichai].map((id) => notesOf(db, id).length)).toEqual([round, round, round, 0, 0]);
    }
    expect(totalNotes()).toBe(30);
  });

  test("NTF-016 บัญชีที่ถูกระงับยังได้แจ้งเตือนตามปกติ", async () => {
    db.prepare("UPDATE accounts SET status = 'ถูกระงับ' WHERE id = ?").run(w.somying);
    const placed = order(db, w.somying, [[w.screwdriver, 1]], at("09:00"));
    db.prepare("UPDATE shops SET status = 'ถูกระงับ' WHERE id = ?").run(w.toolShop);

    await pay(w.somying, placed.groupId, at("09:05"));

    expect([notesOf(db, w.somying).length, notesOf(db, w.somchai).length]).toEqual([1, 1]);
  });

  test("NTF-Q04 เหตุการณ์ 40 ครั้งที่เกิดขณะไม่มีใครเปิดหน้า ได้แจ้งเตือน 40 รายการ ไม่ขาดและไม่ซ้ำ", async () => {
    for (let n = 0; n < 10; n++) await paidOrder(S.delivered, `2026-11-${10 + n}`);

    const parcelNotes = notesOf(db, w.somying).filter((note) => note.type === NOTIFICATION_TYPE.parcelStatus);
    expect(parcelNotes).toHaveLength(40);
    expect(new Set(parcelNotes.map((note) => note.message)).size).toBe(40);
  });
});

describe("NTF-Q07 ครบทุกชนิดและลิงก์ถูกหน้า", () => {
  test("NTF-Q07 เดินเส้นทางสั่งซื้อ จ่ายเงิน จัดส่ง ยืนยันรับ รีวิว ตอบรีวิว และซ่อนรีวิว ได้แจ้งเตือนครบ 11 ชนิด ถึงผู้รับที่ถูกต้อง พร้อมหน้าที่เกี่ยวข้อง", async () => {
    const hammer = addProduct(db, { shopId: w.toolShop, name: "ค้อน", price: 300, stock: 1 }).variantIds[0];
    const T = NOTIFICATION_TYPE;

    const unpaid = order(db, w.somying, [[w.football, 1]], at("08:00", "2026-11-20"));
    expireOverdueOrderGroups(db, at("08:30", "2026-11-20"));

    const received = order(db, w.somying, [[hammer, 1]], at("09:00", "2026-11-21"));
    await pay(w.somying, received.groupId, at("09:02", "2026-11-21"), BAD_CARD);
    await pay(w.somying, received.groupId, at("09:05", "2026-11-21"));
    const receivedParcel = trackingNoOf(db, received.orders[0].id);
    for (let step = 1; step < STEPS.length; step++) {
      move(receivedParcel, w.somchaiActor, STEPS[step - 1], STEPS[step], at(`1${step}:00`, "2026-11-21"));
    }
    confirmReceipt(db, receivedParcel, { id: w.somying, isAdmin: false, shopId: null }, at("18:00", "2026-11-21"));

    const undelivered = await paidOrder(S.outForDelivery, "2026-11-22");
    move(undelivered.trackingNo, w.somchaiActor, S.outForDelivery, S.failed, at("16:00", "2026-11-22"));

    newReview(4, at("18:10", "2026-11-21"));
    replyToReview(at("19:10", "2026-11-21"));
    hideReview(at("20:00", "2026-11-21"));

    const rows = db.prepare("SELECT type, account_id, href, count(*) AS n FROM notifications GROUP BY type, account_id, href ORDER BY type, href").all();
    const seen = Object.fromEntries(Object.values(T).map((type) => [type, rows.filter((row) => row.type === type).map((row) => [row.account_id, row.href, row.n])]));
    expect(seen).toEqual({
      [T.paymentSucceeded]: [
        [w.somying, `/pay/${received.groupId}`, 1],
        [w.somying, `/pay/${undelivered.groupId}`, 1],
      ],
      [T.paymentFailed]: [[w.somying, `/pay/${received.groupId}`, 1]],
      [T.paymentTimedOut]: [[w.somying, `/orders?status=${encodeURIComponent("ยกเลิก")}`, 1]],
      [T.parcelStatus]: [
        [w.somying, `/track/${receivedParcel}`, 4],
        [w.somying, `/track/${undelivered.trackingNo}`, 3],
      ].sort((a, b) => String(a[1]).localeCompare(String(b[1]))),
      [T.orderCancelled]: [[w.somying, `/orders/${undelivered.orderNo}`, 1]],
      [T.reviewReplied]: [[w.somying, REVIEW_PAGE, 1]],
      [T.reviewHidden]: [[w.somying, REVIEW_PAGE, 1]],
      [T.shopNewOrder]: [
        [w.somchai, `/seller/orders/${received.orders[0].orderNo}`, 1],
        [w.somchai, `/seller/orders/${undelivered.orderNo}`, 1],
      ],
      [T.shopOrderCompleted]: [[w.somchai, `/seller/orders/${received.orders[0].orderNo}`, 1]],
      [T.shopNewReview]: [[w.somchai, SHOP_REVIEWS, 1]],
      [T.shopStockEmpty]: [[w.somchai, "/seller/stock?filter=out", 1]],
    });
    expect(notesOf(db, w.mana)).toEqual([]);
    expect(unpaid.orders).toHaveLength(1);
  });
});
