// pnpm tsx scripts/seed-shop-orders.ts seller01@example.com
// เพิ่มคำสั่งซื้อตัวอย่าง 45 รายการครบทุกสถานะให้ร้านของบัญชีนี้ พร้อมการจ่ายเงินและพัสดุ ไว้ลองหน้า /seller/orders
// และเพิ่ม 5 รายการให้ร้านถัดไป ไว้ลองว่าเปิดคำสั่งซื้อของร้านอื่นไม่ได้
// เขียนตรงลงฐานข้อมูลของเครื่องนี้โดยข้ามกฎของการสั่งซื้อ การจ่ายเงิน และการจัดส่ง รันซ้ำจะได้อีกชุด

import { databasePath, openDb, transaction } from "@/shared/db";
import { addOrder, addParcel, addPayment } from "@/shared/db/builders";
import {
  ORDER_STATUS,
  PARCEL_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  type OrderStatus,
  type ParcelStatus,
} from "@/shared/statuses";

const email = process.argv[2] ?? "seller01@example.com";
const db = openDb(databasePath());
const MINUTE = 60 * 1000;

const shop = db
  .prepare("SELECT s.id FROM shops s JOIN accounts a ON a.id = s.owner_account_id WHERE a.email = ?")
  .get(email) as { id: number } | undefined;
const otherShop = db.prepare("SELECT id FROM shops WHERE id <> ? ORDER BY id LIMIT 1").get(shop?.id ?? 0) as { id: number } | undefined;
const buyers = (db.prepare("SELECT id FROM accounts WHERE email LIKE 'buyer%@example.com' ORDER BY id").all() as { id: number }[]).map(
  (row) => row.id,
);
if (!shop || !otherShop || buyers.length === 0) {
  console.error(`ไม่พบร้านของ ${email} หรือไม่มีบัญชีผู้ซื้อตัวอย่าง รัน pnpm seed ก่อน แล้วใช้แบบนี้: pnpm tsx scripts/seed-shop-orders.ts seller01@example.com`);
  process.exit(1);
}

function variantsOf(shopId: number): number[] {
  const rows = db
    .prepare(
      `SELECT v.id FROM variants v JOIN products p ON p.id = v.product_id
       WHERE p.shop_id = ? AND p.status = 'ขายอยู่' AND v.removed_at IS NULL AND v.price IS NOT NULL
       ORDER BY v.id LIMIT 5`,
    )
    .all(shopId) as { id: number }[];
  return rows.map((row) => row.id);
}

// เรียงจากเก่าไปใหม่ คำสั่งซื้อที่รอจ่ายเงินจึงอยู่บนสุดและยังไม่หมดเวลา 30 นาที
const plan: [OrderStatus, ParcelStatus | null][] = [
  ...Array.from({ length: 26 }, (): [OrderStatus, ParcelStatus] => [ORDER_STATUS.completed, PARCEL_STATUS.delivered]),
  [ORDER_STATUS.cancelled, null],
  [ORDER_STATUS.cancelled, null],
  [ORDER_STATUS.cancelled, null],
  [ORDER_STATUS.cancelled, PARCEL_STATUS.failed],
  [ORDER_STATUS.shipping, PARCEL_STATUS.handedOver],
  [ORDER_STATUS.shipping, PARCEL_STATUS.handedOver],
  [ORDER_STATUS.shipping, PARCEL_STATUS.inTransit],
  [ORDER_STATUS.shipping, PARCEL_STATUS.inTransit],
  [ORDER_STATUS.shipping, PARCEL_STATUS.outForDelivery],
  [ORDER_STATUS.shipping, PARCEL_STATUS.outForDelivery],
  [ORDER_STATUS.shipping, PARCEL_STATUS.delivered],
  ...Array.from({ length: 5 }, (): [OrderStatus, ParcelStatus] => [ORDER_STATUS.paid, PARCEL_STATUS.awaitingPacking]),
  ...Array.from({ length: 3 }, (): [OrderStatus, null] => [ORDER_STATUS.awaitingPayment, null]),
];

function addSampleOrders(shopId: number, rows: [OrderStatus, ParcelStatus | null][]): string[] {
  const variants = variantsOf(shopId);
  const now = Date.now();
  return rows.map(([status, parcelStatus], i) => {
    const orderedAt = new Date(now - (rows.length - i) * 7 * MINUTE);
    const created = addOrder(db, {
      buyerAccountId: buyers[i % buyers.length],
      items: [{ variantId: variants[i % variants.length], quantity: 1 + (i % 3) }],
      status,
      orderedAt: orderedAt.toISOString(),
    });
    // เลขจาก builders นับใหม่ทุกครั้งที่รันสคริปต์ ใช้เลขแถวแทนเพื่อไม่ชนกับชุดก่อน
    const orderNo = `${created.orderNo.slice(0, 6)}${String(created.id % 10000).padStart(4, "0")}`;
    db.prepare("UPDATE orders SET order_no = ? WHERE id = ?").run(orderNo, created.id);
    if (parcelStatus) {
      const payment = addPayment(db, {
        groupId: created.groupId,
        method: i % 2 ? PAYMENT_METHOD.promptPay : PAYMENT_METHOD.card,
        status: PAYMENT_STATUS.succeeded,
      });
      db.prepare("UPDATE payments SET started_at = ?, resolved_at = ? WHERE id = ?").run(
        orderedAt.toISOString(),
        new Date(orderedAt.getTime() + 3 * MINUTE).toISOString(),
        payment.id,
      );
      addParcel(db, { orderId: created.id, status: parcelStatus });
    } else if (status === ORDER_STATUS.awaitingPayment && i % 2 === 0) {
      addPayment(db, { groupId: created.groupId, method: PAYMENT_METHOD.promptPay, status: PAYMENT_STATUS.pending });
    }
    return orderNo;
  });
}

const [mine, theirs] = transaction(db, () => [
  addSampleOrders(shop.id, plan),
  addSampleOrders(otherShop.id, Array.from({ length: 5 }, (): [OrderStatus, ParcelStatus] => [ORDER_STATUS.paid, PARCEL_STATUS.awaitingPacking])),
]);
db.close();
console.log(`เพิ่มคำสั่งซื้อ ${mine.length} รายการให้ร้านของ ${email} ล่าสุดคือเลข ${mine.at(-1)}`);
console.log(`เพิ่มคำสั่งซื้อ ${theirs.length} รายการให้ร้านอื่น (ร้านเลข ${otherShop.id}) เช่นเลข ${theirs[0]} ใช้ลองเปิดข้ามร้าน`);
