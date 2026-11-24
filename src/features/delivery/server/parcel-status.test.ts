import { beforeEach, describe, expect, test } from "vitest";
import type { Db } from "@/shared/db";
import { addAccount, addOrder, addProduct, addShop, SAMPLE_ADDRESS } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";
import { formatDateTime } from "@/shared/format";
import { ORDER_STATUS, PARCEL_STATUS, type ParcelStatus } from "@/shared/statuses";
import {
  changeParcelStatus,
  createParcelForPaidOrder,
  FINISHED,
  getParcelForStatusChange,
  LOCATION_ERROR,
  NOT_ALLOWED,
  ONE_STEP,
  ORDER_CANCELLED,
  REASON_ERROR,
  RECEIVER_ERROR,
  STALE,
  type StatusChanger,
} from "./parcel-status";

const S = PARCEL_STATUS;
// 25/11/2026 09:00 เวลาไทย
const at = (day: number, hhmm: string) => new Date(`2026-11-${day}T${hhmm}:00+07:00`);

let db: Db;
let somchai: StatusChanger;
let mana: StatusChanger;
let wichai: StatusChanger;
let somying: StatusChanger;
let hammerVariant: number;

beforeEach(() => {
  db = createTestDb();
  const somchaiId = addAccount(db, { displayName: "สมชาย" }).id;
  const shop = addShop(db, { ownerAccountId: somchaiId, name: "สมชายการช่าง" });
  somchai = { id: somchaiId, isAdmin: false, shopId: shop.id };
  const manaId = addAccount(db, { displayName: "มานะ" }).id;
  mana = { id: manaId, isAdmin: false, shopId: addShop(db, { ownerAccountId: manaId, name: "มานะสปอร์ต" }).id };
  wichai = { id: addAccount(db, { displayName: "วิชัย", isAdmin: true }).id, isAdmin: true, shopId: null };
  somying = { id: addAccount(db, { displayName: "สมหญิง" }).id, isAdmin: false, shopId: null };
  hammerVariant = addProduct(db, { shopId: shop.id, name: "ค้อน", price: 150, stock: 8 }).variantIds[0];
});

function paidOrder(variantId = hammerVariant, quantity = 2) {
  return addOrder(db, { buyerAccountId: somying.id, items: [{ variantId, quantity }], status: ORDER_STATUS.paid });
}

/** พัสดุของคำสั่งซื้อที่จ่ายแล้ว พาไปถึงสถานะที่ต้องการทีละขั้นโดยสมชาย */
function parcelAt(status: ParcelStatus) {
  const order = paidOrder();
  const parcel = createParcelForPaidOrder(db, order.id, at(25, "09:00"));
  const path = [S.awaitingPacking, S.handedOver, S.inTransit, S.outForDelivery, S.delivered];
  for (let i = 1; i <= path.indexOf(status === S.failed ? S.delivered : status); i++) {
    const to = status === S.failed && path[i] === S.delivered ? S.failed : path[i];
    const result = changeParcelStatus(db, {
      trackingNo: parcel.trackingNo,
      actor: somchai,
      from: path[i - 1],
      to,
      location: `จุดที่ ${i}`,
      receiverName: "สมหญิง ใจดี",
      reason: "ไม่มีคนรับ",
    });
    expect(result).toEqual({ ok: true });
  }
  return { ...parcel, orderId: order.id };
}

const parcelRow = (id: number) =>
  db.prepare("SELECT * FROM parcels WHERE id = ?").get(id) as Record<string, string | null>;
const history = (id: number) =>
  db.prepare("SELECT * FROM parcel_history WHERE parcel_id = ? ORDER BY id").all(id) as Record<string, string | number | null>[];
const orderRow = (id: number) =>
  db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as Record<string, string | null>;
const stockOf = (variantId: number) =>
  (db.prepare("SELECT stock FROM variants WHERE id = ?").get(variantId) as { stock: number }).stock;

describe("DLV-001 สร้างพัสดุและเลขติดตามพัสดุ", () => {
  test("DLV-001 คำสั่งซื้อจ่ายแล้ว ได้พัสดุ รอร้านจัดของ พร้อมเลข BS 10 หลัก ที่อยู่ต้นทาง และประวัติรายการแรก", () => {
    const order = paidOrder();
    expect(orderRow(order.id).total).toBe(340);

    const parcel = createParcelForPaidOrder(db, order.id, at(25, "09:00"));

    expect(parcel.trackingNo).toMatch(/^BS\d{10}$/);
    const row = parcelRow(parcel.id);
    expect(row.status).toBe(S.awaitingPacking);
    expect(row.origin_address).toBe(SAMPLE_ADDRESS.address);
    expect(row.origin_postcode).toBe(SAMPLE_ADDRESS.postcode);
    const [first, ...rest] = history(parcel.id);
    expect(rest).toHaveLength(0);
    expect(first.status).toBe(S.awaitingPacking);
    expect(first.location).toBe("สมชายการช่าง");
    expect(first.changed_by_account_id).toBeNull();
    expect(formatDateTime(String(first.created_at))).toBe("25/11/2026 09:00");
  });

  test("DLV-001 ร้านแก้ที่อยู่ต้นทางทีหลัง พัสดุที่สร้างแล้วยังเก็บที่อยู่เดิม (SHP-009)", () => {
    const parcel = createParcelForPaidOrder(db, paidOrder().id, at(25, "09:00"));
    db.prepare("UPDATE shops SET origin_address = 'ที่อยู่ใหม่' WHERE id = ?").run(somchai.shopId);

    expect(parcelRow(parcel.id).origin_address).toBe(SAMPLE_ADDRESS.address);
  });

  test("DLV-001 ผลจ่ายเงินของการจ่ายครั้งเดียวกันมาซ้ำ 2 ครั้ง ยังมีพัสดุ 1 ชิ้นต่อคำสั่งซื้อ", () => {
    const first = paidOrder();
    const ball = addProduct(db, { shopId: mana.shopId!, name: "ลูกฟุตบอล", price: 300 }).variantIds[0];
    const second = addOrder(db, {
      buyerAccountId: somying.id,
      items: [{ variantId: ball }],
      status: ORDER_STATUS.paid,
      groupId: first.groupId,
    });

    const round1 = [first.id, second.id].map((id) => createParcelForPaidOrder(db, id, at(25, "09:00")));
    const round2 = [first.id, second.id].map((id) => createParcelForPaidOrder(db, id, at(25, "09:01")));

    expect(round2).toEqual(round1);
    expect(round1[0].trackingNo).not.toBe(round1[1].trackingNo);
    expect(db.prepare("SELECT count(*) AS n FROM parcels").get()).toEqual({ n: 2 });
    expect(db.prepare("SELECT count(*) AS n FROM parcel_history").get()).toEqual({ n: 2 });
  });

  test("DLV-001 คำสั่งซื้อที่ยังไม่จ่ายเงิน สร้างพัสดุไม่ได้", () => {
    const unpaid = addOrder(db, { buyerAccountId: somying.id, items: [{ variantId: hammerVariant }] });

    expect(() => createParcelForPaidOrder(db, unpaid.id)).toThrow();
    expect(db.prepare("SELECT count(*) AS n FROM parcels").get()).toEqual({ n: 0 });
  });

  test("DLV-001 เลขติดตามพัสดุไม่ซ้ำกัน", () => {
    const numbers = Array.from({ length: 50 }, () => createParcelForPaidOrder(db, paidOrder().id).trackingNo);
    expect(new Set(numbers).size).toBe(50);
  });
});

describe("DLV-002 สิทธิ์เปลี่ยนสถานะการจัดส่ง", () => {
  test("DLV-002 ผู้ดูแลแพลตฟอร์มเปลี่ยนพัสดุของร้านไหนก็ได้", () => {
    const parcel = parcelAt(S.awaitingPacking);

    const result = changeParcelStatus(
      db,
      { trackingNo: parcel.trackingNo, actor: wichai, from: S.awaitingPacking, to: S.handedOver, location: "จุดรับพัสดุบางนา" },
      at(25, "10:00"),
    );

    expect(result).toEqual({ ok: true });
    expect(parcelRow(parcel.id).status).toBe(S.handedOver);
    expect(history(parcel.id)).toHaveLength(2);
  });

  test("DLV-002 ผู้ขายร้านอื่นและผู้ซื้อเปลี่ยนไม่ได้ ไม่มีอะไรเปลี่ยน", () => {
    const parcel = parcelAt(S.awaitingPacking);

    for (const actor of [mana, somying]) {
      const result = changeParcelStatus(db, {
        trackingNo: parcel.trackingNo,
        actor,
        from: S.awaitingPacking,
        to: S.handedOver,
        location: "จุดรับพัสดุบางนา",
      });
      expect(result).toEqual({ ok: false, error: NOT_ALLOWED });
    }
    expect(parcelRow(parcel.id).status).toBe(S.awaitingPacking);
    expect(history(parcel.id)).toHaveLength(1);
    expect(getParcelForStatusChange(db, parcel.trackingNo, somying)).toBeNull();
    expect(getParcelForStatusChange(db, parcel.trackingNo, mana)).toBeNull();
  });

  test("DLV-002 เลขติดตามพัสดุที่ไม่มีอยู่ ได้ข้อความเดียวกับไม่มีสิทธิ์", () => {
    const result = changeParcelStatus(db, {
      trackingNo: "BS9999999999",
      actor: wichai,
      from: S.awaitingPacking,
      to: S.handedOver,
      location: "ที่ไหนก็ได้",
    });
    expect(result).toEqual({ ok: false, error: NOT_ALLOWED });
  });
});

describe("DLV-003 เดินหน้าทีละขั้น ไม่ย้อน ไม่ข้าม", () => {
  test("DLV-003 ขั้นถัดไปของ ร้านส่งของแล้ว มีอย่างเดียว ของ กำลังนำส่ง มีสองอย่าง", () => {
    const handedOver = parcelAt(S.handedOver);
    const outForDelivery = parcelAt(S.outForDelivery);

    expect(getParcelForStatusChange(db, handedOver.trackingNo, somchai)?.nextStatuses).toEqual([S.inTransit]);
    expect(getParcelForStatusChange(db, outForDelivery.trackingNo, somchai)?.nextStatuses).toEqual([
      S.delivered,
      S.failed,
    ]);
  });

  test("DLV-003 ขอข้ามขั้นหรือย้อนกลับ ถูกปฏิเสธพร้อมสถานะปัจจุบัน", () => {
    const parcel = parcelAt(S.handedOver);

    for (const to of [S.delivered, S.awaitingPacking]) {
      const result = changeParcelStatus(db, {
        trackingNo: parcel.trackingNo,
        actor: somchai,
        from: S.handedOver,
        to,
        location: "ที่ไหนก็ได้",
        receiverName: "สมหญิง ใจดี",
      });
      expect(result).toEqual({ ok: false, error: ONE_STEP, currentStatus: S.handedOver });
    }
    expect(parcelRow(parcel.id).status).toBe(S.handedOver);
    expect(history(parcel.id)).toHaveLength(2);
  });
});

describe("DLV-004 บันทึกเวลา สถานที่ และคนเปลี่ยน ทุกครั้ง", () => {
  test("DLV-004 บันทึกแล้วได้ประวัติรายการใหม่ที่มีสถานะ เวลา สถานที่ และคนเปลี่ยน", () => {
    const parcel = parcelAt(S.handedOver);

    const result = changeParcelStatus(
      db,
      { trackingNo: parcel.trackingNo, actor: somchai, from: S.handedOver, to: S.inTransit, location: "  ศูนย์คัดแยกลาดกระบัง " },
      at(25, "13:20"),
    );

    expect(result).toEqual({ ok: true });
    expect(parcelRow(parcel.id).status).toBe(S.inTransit);
    const rows = history(parcel.id);
    expect(rows).toHaveLength(3);
    const latest = rows[2];
    expect(latest.status).toBe(S.inTransit);
    expect(latest.location).toBe("ศูนย์คัดแยกลาดกระบัง");
    expect(latest.changed_by_account_id).toBe(somchai.id);
    expect(formatDateTime(String(latest.created_at))).toBe("25/11/2026 13:20");
    expect(getParcelForStatusChange(db, parcel.trackingNo, somchai)?.latest).toEqual({
      status: S.inTransit,
      at: at(25, "13:20").toISOString(),
      location: "ศูนย์คัดแยกลาดกระบัง",
    });
  });

  test("DLV-004 สถานที่ว่าง เป็นช่องว่างล้วน หรือยาว 101 ตัวอักษร บันทึกไม่ได้", () => {
    const parcel = parcelAt(S.handedOver);

    for (const location of ["", "     ", "ก".repeat(101)]) {
      const result = changeParcelStatus(db, {
        trackingNo: parcel.trackingNo,
        actor: somchai,
        from: S.handedOver,
        to: S.inTransit,
        location,
      });
      expect(result).toEqual({ ok: false, fieldErrors: { location: LOCATION_ERROR } });
    }
    expect(parcelRow(parcel.id).status).toBe(S.handedOver);
    expect(history(parcel.id)).toHaveLength(2);
  });

  test("DLV-004 สถานที่ยาว 100 ตัวอักษรพอดี บันทึกได้", () => {
    const parcel = parcelAt(S.handedOver);
    const result = changeParcelStatus(db, {
      trackingNo: parcel.trackingNo,
      actor: somchai,
      from: S.handedOver,
      to: S.inTransit,
      location: "ก".repeat(100),
    });
    expect(result).toEqual({ ok: true });
  });
});

describe("DLV-005 ส่งสำเร็จ ต้องมีชื่อผู้รับ", () => {
  test("DLV-005 กรอกสถานที่และชื่อผู้รับ พัสดุเป็นส่งสำเร็จ เก็บชื่อผู้รับและเวลาส่งถึง", () => {
    const parcel = parcelAt(S.outForDelivery);
    expect(history(parcel.id)).toHaveLength(4);

    const result = changeParcelStatus(
      db,
      {
        trackingNo: parcel.trackingNo,
        actor: somchai,
        from: S.outForDelivery,
        to: S.delivered,
        location: "บ้านเลขที่ 12 ซอยอ่อนนุช 17",
        receiverName: "สมหญิง ใจดี",
      },
      at(26, "15:30"),
    );

    expect(result).toEqual({ ok: true });
    const row = parcelRow(parcel.id);
    expect(row.status).toBe(S.delivered);
    expect(row.receiver_name).toBe("สมหญิง ใจดี");
    expect(row.delivered_at).toBe(at(26, "15:30").toISOString());
    expect(history(parcel.id)).toHaveLength(5);
    expect(orderRow(parcel.orderId).status).toBe(ORDER_STATUS.shipping);
  });

  test("DLV-005 ไม่กรอกชื่อผู้รับ บันทึกไม่ได้ พัสดุยังกำลังนำส่ง", () => {
    const parcel = parcelAt(S.outForDelivery);

    for (const receiverName of [undefined, "", "   ", "ก".repeat(101)]) {
      const result = changeParcelStatus(db, {
        trackingNo: parcel.trackingNo,
        actor: somchai,
        from: S.outForDelivery,
        to: S.delivered,
        location: "บ้านเลขที่ 12 ซอยอ่อนนุช 17",
        receiverName,
      });
      expect(result).toEqual({ ok: false, fieldErrors: { receiverName: RECEIVER_ERROR } });
    }
    expect(parcelRow(parcel.id).status).toBe(S.outForDelivery);
    expect(history(parcel.id)).toHaveLength(4);
  });
});

describe("DLV-006 ส่งไม่สำเร็จ ต้องมีเหตุผล และยกเลิกคำสั่งซื้อ", () => {
  test("DLV-006 กรอกสถานที่และเหตุผล พัสดุเป็นส่งไม่สำเร็จ คำสั่งซื้อเป็นยกเลิก และไม่มีขั้นถัดไป", () => {
    const parcel = parcelAt(S.outForDelivery);

    const result = changeParcelStatus(
      db,
      {
        trackingNo: parcel.trackingNo,
        actor: somchai,
        from: S.outForDelivery,
        to: S.failed,
        location: "หน้าบ้านผู้ซื้อ ซอยอ่อนนุช 17",
        reason: "ไม่มีคนรับ โทรไม่ติด 2 ครั้ง",
      },
      at(25, "16:00"),
    );

    expect(result).toEqual({ ok: true });
    const row = parcelRow(parcel.id);
    expect(row.status).toBe(S.failed);
    expect(row.failure_reason).toBe("ไม่มีคนรับ โทรไม่ติด 2 ครั้ง");
    const order = orderRow(parcel.orderId);
    expect(order.status).toBe(ORDER_STATUS.cancelled);
    expect(order.cancelled_at).toBe(at(25, "16:00").toISOString());
    expect(order.cancel_reason).toBe(S.failed);
    expect(getParcelForStatusChange(db, parcel.trackingNo, somchai)?.nextStatuses).toEqual([]);
  });

  test("DLV-006 INV-013 ส่งไม่สำเร็จแล้วสต็อกคืน", () => {
    const screwdriver = addProduct(db, { shopId: somchai.shopId!, name: "ไขควง", stock: 7 }).variantIds[0];
    const order = paidOrder(screwdriver, 3);
    const parcel = createParcelForPaidOrder(db, order.id);
    const path = [S.awaitingPacking, S.handedOver, S.inTransit, S.outForDelivery, S.failed];
    for (let i = 1; i < path.length; i++) {
      changeParcelStatus(db, {
        trackingNo: parcel.trackingNo,
        actor: somchai,
        from: path[i - 1],
        to: path[i],
        location: "หน้าบ้านผู้ซื้อ ซอยอ่อนนุช 17",
        reason: "ไม่มีคนรับ โทรไม่ติด 2 ครั้ง",
      });
    }
    expect(stockOf(screwdriver)).toBe(10);
  });

  test("DLV-006 ไม่กรอกเหตุผล บันทึกไม่ได้ และพัสดุที่ส่งไม่สำเร็จแล้วเปลี่ยนต่อไม่ได้", () => {
    const parcel = parcelAt(S.outForDelivery);
    const ended = parcelAt(S.failed);
    const stockBefore = stockOf(hammerVariant);

    for (const reason of [undefined, "  ", "ก".repeat(201)]) {
      const result = changeParcelStatus(db, {
        trackingNo: parcel.trackingNo,
        actor: somchai,
        from: S.outForDelivery,
        to: S.failed,
        location: "หน้าบ้านผู้ซื้อ ซอยอ่อนนุช 17",
        reason,
      });
      expect(result).toEqual({ ok: false, fieldErrors: { reason: REASON_ERROR } });
    }
    expect(parcelRow(parcel.id).status).toBe(S.outForDelivery);
    expect(stockOf(hammerVariant)).toBe(stockBefore);
    expect(orderRow(parcel.orderId).status).toBe(ORDER_STATUS.shipping);

    const result = changeParcelStatus(db, {
      trackingNo: ended.trackingNo,
      actor: wichai,
      from: S.failed,
      to: S.delivered,
      location: "บ้านเลขที่ 12",
      receiverName: "สมหญิง ใจดี",
    });
    expect(result).toEqual({ ok: false, error: FINISHED });
    expect(parcelRow(ended.id).status).toBe(S.failed);
  });

  test("DLV-006 เหตุผลยาว 200 ตัวอักษรพอดี บันทึกได้", () => {
    const parcel = parcelAt(S.outForDelivery);
    const result = changeParcelStatus(db, {
      trackingNo: parcel.trackingNo,
      actor: somchai,
      from: S.outForDelivery,
      to: S.failed,
      location: "หน้าบ้าน",
      reason: "ก".repeat(200),
    });
    expect(result).toEqual({ ok: true });
  });
});

describe("DLV-007 คำสั่งซื้อเป็นกำลังจัดส่งเมื่อร้านส่งของ", () => {
  test("DLV-007 พัสดุเป็นร้านส่งของแล้ว คำสั่งซื้อเปลี่ยนจากจ่ายแล้วเป็นกำลังจัดส่งในการบันทึกเดียวกัน", () => {
    const parcel = parcelAt(S.awaitingPacking);
    expect(orderRow(parcel.orderId).status).toBe(ORDER_STATUS.paid);

    changeParcelStatus(
      db,
      { trackingNo: parcel.trackingNo, actor: somchai, from: S.awaitingPacking, to: S.handedOver, location: "จุดรับพัสดุบางนา" },
      at(25, "10:00"),
    );

    expect(orderRow(parcel.orderId).status).toBe(ORDER_STATUS.shipping);
    expect(parcelRow(parcel.id).status).toBe(S.handedOver);
  });

  test("DLV-007 บันทึกไม่สำเร็จกลางทาง ไม่มีอะไรเปลี่ยนเลย ไม่เปลี่ยนไปอย่างเดียว", () => {
    const parcel = parcelAt(S.awaitingPacking);
    db.exec("CREATE TRIGGER fail_order_update BEFORE UPDATE ON orders BEGIN SELECT RAISE(ABORT, 'จำลองบันทึกไม่สำเร็จ'); END");

    expect(() =>
      changeParcelStatus(db, {
        trackingNo: parcel.trackingNo,
        actor: somchai,
        from: S.awaitingPacking,
        to: S.handedOver,
        location: "จุดรับพัสดุบางนา",
      }),
    ).toThrow("จำลองบันทึกไม่สำเร็จ");

    expect(orderRow(parcel.orderId).status).toBe(ORDER_STATUS.paid);
    expect(parcelRow(parcel.id).status).toBe(S.awaitingPacking);
    expect(history(parcel.id)).toHaveLength(1);
  });
});

describe("DLV-008 เปลี่ยนพร้อมกัน กดซ้ำ และหน้าที่เปิดค้างไว้", () => {
  test("DLV-008 สองคนกดเปลี่ยนเป็นขั้นเดียวกัน คนแรกได้ คนที่สองได้ข้อความพร้อมสถานะล่าสุด", () => {
    const parcel = parcelAt(S.inTransit);
    const request = (actor: StatusChanger) =>
      changeParcelStatus(db, {
        trackingNo: parcel.trackingNo,
        actor,
        from: S.inTransit,
        to: S.outForDelivery,
        location: "ศูนย์กระจายสินค้าอ่อนนุช",
      });

    expect(request(somchai)).toEqual({ ok: true });
    expect(request(wichai)).toEqual({ ok: false, error: STALE, currentStatus: S.outForDelivery });
    expect(history(parcel.id)).toHaveLength(4);
  });

  test("DLV-008 กดบันทึกซ้ำ และกดจากหน้าที่เปิดค้างไว้ ไม่เพิ่มประวัติ ไม่ยกเลิกคำสั่งซื้อ", () => {
    const parcel = parcelAt(S.outForDelivery);
    const deliver = () =>
      changeParcelStatus(db, {
        trackingNo: parcel.trackingNo,
        actor: somchai,
        from: S.outForDelivery,
        to: S.delivered,
        location: "บ้านเลขที่ 12 ซอยอ่อนนุช 17",
        receiverName: "สมหญิง ใจดี",
      });

    expect(deliver()).toEqual({ ok: true });
    expect(deliver()).toEqual({ ok: false, error: STALE, currentStatus: S.delivered });
    const late = changeParcelStatus(db, {
      trackingNo: parcel.trackingNo,
      actor: wichai,
      from: S.outForDelivery,
      to: S.failed,
      location: "หน้าบ้าน",
      reason: "ไม่มีคนรับ",
    });
    expect(late).toEqual({ ok: false, error: STALE, currentStatus: S.delivered });

    const rows = history(parcel.id);
    expect(rows).toHaveLength(5);
    expect(rows.filter((row) => row.status === S.delivered)).toHaveLength(1);
    expect(orderRow(parcel.orderId).status).toBe(ORDER_STATUS.shipping);
    expect(stockOf(hammerVariant)).toBe(8);
  });
});

describe("DLV-009 พัสดุของคำสั่งซื้อที่ยกเลิกแล้ว", () => {
  const cancel = (orderId: number) =>
    db.prepare("UPDATE orders SET status = ?, cancelled_at = ? WHERE id = ?").run(
      ORDER_STATUS.cancelled,
      at(25, "09:30").toISOString(),
      orderId,
    );

  test("DLV-009 คำสั่งซื้อถูกยกเลิก หน้าเปลี่ยนสถานะไม่มีขั้นถัดไป และประวัติเดิมยังอยู่", () => {
    const parcel = parcelAt(S.awaitingPacking);
    cancel(parcel.orderId);

    const view = getParcelForStatusChange(db, parcel.trackingNo, somchai);
    expect(view?.orderStatus).toBe(ORDER_STATUS.cancelled);
    expect(view?.nextStatuses).toEqual([]);
    expect(history(parcel.id)).toHaveLength(1);
  });

  test("DLV-009 กดบันทึกจากหน้าที่เปิดไว้ก่อนยกเลิก ถูกปฏิเสธ ไม่มีอะไรเปลี่ยน", () => {
    const parcel = parcelAt(S.awaitingPacking);
    cancel(parcel.orderId);

    const result = changeParcelStatus(
      db,
      { trackingNo: parcel.trackingNo, actor: somchai, from: S.awaitingPacking, to: S.handedOver, location: "จุดรับพัสดุบางนา" },
      at(25, "09:40"),
    );

    expect(result).toEqual({ ok: false, error: ORDER_CANCELLED });
    expect(parcelRow(parcel.id).status).toBe(S.awaitingPacking);
    expect(history(parcel.id)).toHaveLength(1);
    expect(orderRow(parcel.orderId).status).toBe(ORDER_STATUS.cancelled);
  });
});

describe("DLV-Q02 ไม่มีรายการซ้ำเมื่อเปลี่ยนพร้อมกัน", () => {
  test("DLV-Q02 พัสดุ 100 ชิ้น สองคนขอเปลี่ยนเป็นร้านส่งของแล้วพร้อมกัน ทุกชิ้นได้ประวัติ 2 รายการพอดี", () => {
    const parcels = Array.from({ length: 100 }, () => createParcelForPaidOrder(db, paidOrder().id));

    for (const parcel of parcels) {
      const results = [somchai, wichai].map((actor) =>
        changeParcelStatus(db, {
          trackingNo: parcel.trackingNo,
          actor,
          from: S.awaitingPacking,
          to: S.handedOver,
          location: "จุดรับพัสดุบางนา",
        }),
      );
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.filter((result) => !result.ok && result.error === STALE)).toHaveLength(1);
    }

    const counts = db
      .prepare(
        `SELECT p.status, count(h.id) AS n FROM parcels p JOIN parcel_history h ON h.parcel_id = p.id
         GROUP BY p.id`,
      )
      .all() as { status: string; n: number }[];
    expect(counts).toHaveLength(100);
    expect(counts.every((row) => row.n === 2 && row.status === S.handedOver)).toBe(true);
  });

  test("DLV-Q02 คำขอที่สองไม่ข้ามไปเป็นอยู่ระหว่างขนส่ง แม้ส่งมาเป็นขั้นถัดไปของสถานะใหม่", () => {
    const parcel = parcelAt(S.awaitingPacking);
    changeParcelStatus(db, {
      trackingNo: parcel.trackingNo,
      actor: somchai,
      from: S.awaitingPacking,
      to: S.handedOver,
      location: "จุดรับพัสดุบางนา",
    });

    const result = changeParcelStatus(db, {
      trackingNo: parcel.trackingNo,
      actor: wichai,
      from: S.awaitingPacking,
      to: S.inTransit,
      location: "ศูนย์คัดแยก",
    });

    expect(result).toEqual({ ok: false, error: STALE, currentStatus: S.handedOver });
    expect(parcelRow(parcel.id).status).toBe(S.handedOver);
    expect(history(parcel.id)).toHaveLength(2);
  });
});
