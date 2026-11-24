// รอยต่อระหว่าง feature ของเส้นทางหลัก ทุก test ใช้โมดูลจริงทั้งสองฝั่ง ไม่แทนฝั่งใดด้วยตัวปลอม

import { beforeEach, describe, expect, test, vi } from "vitest";
import { cancelOrderGroup, getBuyerOrder, listBuyerOrders } from "@/features/checkout/server/buyer-orders";
import { getCheckout, placeOrder } from "@/features/checkout/server/checkout";
import { expireOverdueOrderGroups, PAYMENT_WINDOW_MS } from "@/features/checkout/server/order-groups";
import { changeParcelStatus } from "@/features/delivery/server/parcel-status";
import { confirmReceipt } from "@/features/delivery/server/receipt";
import { changePaymentMethod, markGroupPaid, payByCard, payByPromptPay } from "@/features/payment/server/payments";
import { createSimulator } from "@/features/payment/server/simulator";
import { countOrdersAwaitingPacking } from "@/features/shop-orders/server/orders";
import type { Db } from "@/shared/db";
import { addAccount, addAddress, addCartItem, addProduct, addShop } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";
import { sellerMenuLinks } from "@/shared/nav/registry";
import { ORDER_STATUS, PARCEL_STATUS, PAYMENT_STATUS } from "@/shared/statuses";

let db: Db;
beforeEach(() => {
  db = createTestDb();
});

const T0 = new Date("2026-11-24T07:00:00.000Z");
const later = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);
const GOOD_CARD = { number: "4242424242424242", name: "SOMYING JAIDEE", expiry: "12/30", securityCode: "123" };

const stockOf = (variantId: number) => Number(db.prepare("SELECT stock FROM variants WHERE id = ?").get(variantId)?.stock);
const ordersOf = (groupId: number) =>
  db.prepare("SELECT id, status, cancel_reason FROM orders WHERE group_id = ? ORDER BY id").all(groupId) as {
    id: number;
    status: string;
    cancel_reason: string | null;
  }[];
const parcelsOf = (groupId: number) =>
  db
    .prepare("SELECT p.tracking_no, p.status FROM parcels p JOIN orders o ON o.id = p.order_id WHERE o.group_id = ? ORDER BY o.id")
    .all(groupId) as { tracking_no: string; status: string }[];
const paymentStatuses = (groupId: number) =>
  (db.prepare("SELECT status FROM payments WHERE group_id = ? ORDER BY id").all(groupId) as { status: string }[]).map((p) => p.status);

/** สมหญิงสั่งของจากสองร้านผ่านหน้าสั่งซื้อจริง สต็อกถูกจองจริง */
function somyingOrdersFromTwoShops() {
  const buyer = addAccount(db, { displayName: "สมหญิง" });
  addAddress(db, { accountId: buyer.id, isDefault: true });
  const sellerA = addAccount(db);
  const sellerB = addAccount(db);
  const shopA = addShop(db, { ownerAccountId: sellerA.id, name: "ผ้าดี" });
  const shopB = addShop(db, { ownerAccountId: sellerB.id, name: "บ้านแก้ว" });
  const shirt = addProduct(db, { shopId: shopA.id, name: "เสื้อยืด", price: 200, stock: 5 }).variantIds[0];
  const glass = addProduct(db, { shopId: shopB.id, name: "แก้วน้ำ", price: 150, stock: 3 }).variantIds[0];
  addCartItem(db, { accountId: buyer.id, variantId: shirt, quantity: 2 });
  addCartItem(db, { accountId: buyer.id, variantId: glass, quantity: 1 });

  const checkout = getCheckout(db, buyer.id);
  const placed = placeOrder(
    db,
    {
      buyerAccountId: buyer.id,
      addressId: checkout.addresses[0].id,
      orderKey: checkout.orderKey,
      lines: checkout.shops.flatMap((shop) =>
        shop.lines.map((line) => ({ cartItemId: line.cartItemId, quantity: line.quantity, unitPrice: line.unitPrice ?? 0 })),
      ),
    },
    T0,
  );
  if (!placed.ok) throw new Error("ต้องสั่งซื้อได้");
  expect(stockOf(shirt)).toBe(3);
  expect(stockOf(glass)).toBe(2);
  const orderNos = (db.prepare("SELECT order_no FROM orders WHERE group_id = ? ORDER BY id").all(placed.groupId) as { order_no: string }[]).map(
    (o) => o.order_no,
  );
  return {
    buyer: { id: buyer.id, isAdmin: false, shopId: null },
    sellerA: { id: sellerA.id, isAdmin: false, shopId: shopA.id },
    shopA,
    shirt,
    glass,
    groupId: placed.groupId,
    orderNos,
  };
}

describe("จ่ายเงินแล้วได้พัสดุ (PAY-005 → DLV-001)", () => {
  test("PAY-005 DLV-001 จ่ายด้วยบัตรสำเร็จ ทุกคำสั่งซื้อในกลุ่มเป็นจ่ายแล้ว และได้พัสดุรอร้านจัดของคำสั่งซื้อละหนึ่งชิ้น", async () => {
    const { buyer, groupId } = somyingOrdersFromTwoShops();

    const result = await payByCard(db, createSimulator(), { buyerId: buyer.id, groupId, card: GOOD_CARD }, later(5));

    expect(result).toEqual({ kind: "done", status: PAYMENT_STATUS.succeeded });
    expect(ordersOf(groupId).map((o) => o.status)).toEqual([ORDER_STATUS.paid, ORDER_STATUS.paid]);
    const parcels = parcelsOf(groupId);
    expect(parcels.map((p) => p.status)).toEqual([PARCEL_STATUS.awaitingPacking, PARCEL_STATUS.awaitingPacking]);
    expect(parcels.every((p) => /^BS\d{10}$/.test(p.tracking_no))).toBe(true);
  });

  test("PAY-005 DLV-001 ผลสำเร็จมาซ้ำ ไม่สร้างพัสดุซ้ำ", async () => {
    const { buyer, groupId } = somyingOrdersFromTwoShops();
    await payByCard(db, createSimulator(), { buyerId: buyer.id, groupId, card: GOOD_CARD }, later(5));
    const paymentId = Number(db.prepare("SELECT id FROM payments WHERE group_id = ?").get(groupId)?.id);

    expect(markGroupPaid(db, paymentId, later(6)).paidOrderIds).toEqual([]);
    expect(parcelsOf(groupId)).toHaveLength(2);
  });

  test("PAY-006 DLV-001 บัตรถูกปฏิเสธ ไม่มีพัสดุ คำสั่งซื้อยังรอจ่ายเงิน", async () => {
    const { buyer, groupId } = somyingOrdersFromTwoShops();
    const card = { ...GOOD_CARD, number: "4111111111140011" };

    await payByCard(db, createSimulator(), { buyerId: buyer.id, groupId, card }, later(5));

    expect(parcelsOf(groupId)).toEqual([]);
    expect(ordersOf(groupId).map((o) => o.status)).toEqual([ORDER_STATUS.awaitingPayment, ORDER_STATUS.awaitingPayment]);
  });
});

describe("ผู้ซื้อยกเลิกแล้วสต็อกคืน (CHK-011 → INV-013 และ PAY)", () => {
  test("CHK-011 INV-013 ยกเลิกตอนรอจ่ายเงิน สต็อกที่จองไว้คืนครบทั้งสองร้าน", () => {
    const { buyer, groupId, orderNos, shirt, glass } = somyingOrdersFromTwoShops();

    expect(cancelOrderGroup(db, { buyerAccountId: buyer.id, orderNo: orderNos[0] }, later(10))).toEqual({ ok: true });

    expect(ordersOf(groupId).map((o) => o.status)).toEqual([ORDER_STATUS.cancelled, ORDER_STATUS.cancelled]);
    expect(stockOf(shirt)).toBe(5);
    expect(stockOf(glass)).toBe(3);
  });

  test("CHK-011 PAY-004 PromptPay ที่ตัวจ่ายเงินสร้างไว้ยังรอผล ยกเลิกไม่ได้ เปลี่ยนวิธีจ่ายแล้วจึงยกเลิกได้", async () => {
    const { buyer, groupId, orderNos, shirt } = somyingOrdersFromTwoShops();
    await payByPromptPay(db, createSimulator(), { buyerId: buyer.id, groupId }, later(5));
    expect(paymentStatuses(groupId)).toEqual([PAYMENT_STATUS.pending]);

    expect(cancelOrderGroup(db, { buyerAccountId: buyer.id, orderNo: orderNos[1] }, later(6))).toEqual({
      ok: false,
      reason: "paymentPending",
    });
    expect(stockOf(shirt)).toBe(3);

    changePaymentMethod(db, { buyerId: buyer.id, groupId });
    expect(cancelOrderGroup(db, { buyerAccountId: buyer.id, orderNo: orderNos[1] }, later(7))).toEqual({ ok: true });
    expect(stockOf(shirt)).toBe(5);
  });
});

describe("หมดเวลาจ่ายเงิน (CHK-008 → INV-014 และ PAY-013)", () => {
  test("CHK-008 INV-014 PAY-013 ครบ 30 นาที คำสั่งซื้อยกเลิก สต็อกคืน และ PromptPay ที่รอผลเป็นเลิกรอ", async () => {
    const { buyer, groupId, shirt, glass } = somyingOrdersFromTwoShops();
    await payByPromptPay(db, createSimulator(), { buyerId: buyer.id, groupId }, later(25));

    expect(expireOverdueOrderGroups(db, new Date(T0.getTime() + PAYMENT_WINDOW_MS))).toBe(1);

    expect(ordersOf(groupId).map((o) => o.cancel_reason)).toEqual(["หมดเวลาจ่ายเงิน", "หมดเวลาจ่ายเงิน"]);
    expect(paymentStatuses(groupId)).toEqual([PAYMENT_STATUS.abandoned]);
    expect(stockOf(shirt)).toBe(5);
    expect(stockOf(glass)).toBe(3);
  });

  test("CHK-008 CHK-010 เปิดหน้าคำสั่งซื้อหลังครบเวลาก่อนรอบตรวจมาถึง เห็นยกเลิกทันที และสต็อกคืน", () => {
    const { buyer, orderNos, shirt } = somyingOrdersFromTwoShops();

    const detail = getBuyerOrder(db, buyer.id, orderNos[0], later(31));

    expect(detail).toMatchObject({ status: ORDER_STATUS.cancelled, cancelReason: "หมดเวลาจ่ายเงิน", payable: false });
    expect(stockOf(shirt)).toBe(5);
  });

  test("CHK-008 CHK-009 เปิดหน้ารายการคำสั่งซื้อหลังครบเวลา เห็นยกเลิกทันที", () => {
    const { buyer } = somyingOrdersFromTwoShops();

    const page = listBuyerOrders(db, buyer.id, {}, later(31));

    expect(page.orders.map((o) => o.status)).toEqual([ORDER_STATUS.cancelled, ORDER_STATUS.cancelled]);
  });

  test("CHK-008 ก่อนครบเวลา เปิดหน้าคำสั่งซื้อแล้วยังรอจ่ายเงิน", () => {
    const { buyer, orderNos } = somyingOrdersFromTwoShops();
    expect(getBuyerOrder(db, buyer.id, orderNos[0], later(29))?.status).toBe(ORDER_STATUS.awaitingPayment);
  });
});

describe("การจัดส่งจนจบ (DLV → CHK และ INV)", () => {
  async function paidGroup() {
    const flow = somyingOrdersFromTwoShops();
    await payByCard(db, createSimulator(), { buyerId: flow.buyer.id, groupId: flow.groupId, card: GOOD_CARD }, later(5));
    return { ...flow, trackingNo: parcelsOf(flow.groupId)[0].tracking_no };
  }

  function advance(trackingNo: string, actor: { id: number; isAdmin: boolean; shopId: number | null }, last: string) {
    const path = [
      PARCEL_STATUS.awaitingPacking,
      PARCEL_STATUS.handedOver,
      PARCEL_STATUS.inTransit,
      PARCEL_STATUS.outForDelivery,
      last,
    ];
    for (let i = 1; i < path.length; i++) {
      const result = changeParcelStatus(
        db,
        { trackingNo, actor, from: path[i - 1], to: path[i], location: `จุดที่ ${i}`, receiverName: "สมหญิง", reason: "ไม่มีคนรับ" },
        later(60 + i),
      );
      expect(result).toEqual({ ok: true });
    }
  }

  test("DLV-006 INV-013 พัสดุส่งไม่สำเร็จ คำสั่งซื้อยกเลิก และสต็อกที่ขายไปคืนกลับ", async () => {
    const { sellerA, groupId, trackingNo, shirt } = await paidGroup();

    advance(trackingNo, sellerA, PARCEL_STATUS.failed);

    expect(ordersOf(groupId)[0]).toMatchObject({ status: ORDER_STATUS.cancelled, cancel_reason: "ส่งไม่สำเร็จ" });
    expect(stockOf(shirt)).toBe(5);
  });

  test("DLV-005 DLV-012 ส่งสำเร็จแล้วผู้ซื้อกดได้รับสินค้าแล้ว คำสั่งซื้อสำเร็จ และสต็อกไม่คืน", async () => {
    const { buyer, sellerA, groupId, trackingNo, shirt } = await paidGroup();

    advance(trackingNo, sellerA, PARCEL_STATUS.delivered);
    expect(confirmReceipt(db, trackingNo, buyer, later(70))).toEqual({ ok: true });

    expect(ordersOf(groupId)[0].status).toBe(ORDER_STATUS.completed);
    expect(stockOf(shirt)).toBe(3);
  });
});

describe("ตัวนับรอจัดของตัวเดียว (SHP-006 ORD-004)", () => {
  test("SHP-006 ORD-004 หน้าแรกของหลังบ้านและเมนูนับคำสั่งซื้อที่จ่ายแล้วจากตัวนับเดียวกัน", async () => {
    const { buyer, groupId, shopA } = somyingOrdersFromTwoShops();
    expect(countOrdersAwaitingPacking(db, shopA.id)).toBe(0);

    await payByCard(db, createSimulator(), { buyerId: buyer.id, groupId, card: GOOD_CARD }, later(5));

    expect(countOrdersAwaitingPacking(db, shopA.id)).toBe(1);
  });
});

describe("เมนูหลังบ้านครบ (SHP-006)", () => {
  test("SHP-006 เมนูจากทุก feature มีทางเข้า 5 ทาง และตัวเลขรอจัดของ", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const hrefs = sellerMenuLinks(7).map((link) => link.href);
    expect(hrefs).toEqual(
      expect.arrayContaining(["/seller/products", "/seller/stock", "/seller/orders", "/seller/settings", "/shops/7"]),
    );
    expect(sellerMenuLinks(7).map((link) => link.label)).toContain("รอจัดของ –");
  });
});
