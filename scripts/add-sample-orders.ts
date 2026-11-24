// pnpm tsx scripts/add-sample-orders.ts buyer1@example.com
// เพิ่มคำสั่งซื้อตัวอย่าง 25 รายการให้บัญชีนี้ในฐานข้อมูลของเครื่องนี้ ไว้ลองหน้า /orders และ /orders/[orderNo]
// ได้กลุ่มคำสั่งซื้อที่รอจ่ายเงิน 1 กลุ่ม (2 ร้าน) ที่ยกเลิกเพราะหมดเวลา 1 รายการ และที่จ่ายแล้วพร้อมพัสดุ 22 รายการ
// ข้อมูลสร้างตรงจากตัวสร้างของ test จึงไม่ตัดสต็อก และรันได้ครั้งเดียวต่อฐานข้อมูล ถ้าจะรันใหม่ให้ pnpm seed --reset ก่อน

import { databasePath, openDb } from "@/shared/db";
import { addOrder, addParcel } from "@/shared/db/builders";
import { ORDER_STATUS, PRODUCT_STATUS } from "@/shared/statuses";

const email = process.argv[2];
const db = openDb(databasePath());
const buyer = email ? (db.prepare("SELECT id FROM accounts WHERE email = ?").get(email) as { id: number } | undefined) : undefined;
if (!buyer) {
  console.error(`ไม่พบบัญชี ${email ?? ""} ใช้แบบนี้: pnpm tsx scripts/add-sample-orders.ts buyer1@example.com`);
  process.exit(1);
}

// หนึ่งแบบย่อยต่อหนึ่งร้าน เพราะหนึ่งคำสั่งซื้อมีสินค้าได้ร้านเดียว
const variants = db
  .prepare(
    `SELECT min(v.id) AS id FROM variants v JOIN products p ON p.id = v.product_id
     WHERE p.status = ? AND v.price IS NOT NULL GROUP BY p.shop_id ORDER BY p.shop_id LIMIT 24`,
  )
  .all(PRODUCT_STATUS.onSale) as { id: number }[];
if (variants.length < 24) {
  console.error("ข้อมูลตัวอย่างยังไม่พอ รัน pnpm seed ก่อน");
  process.exit(1);
}

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

for (let i = 0; i < 22; i++) {
  const order = addOrder(db, {
    buyerAccountId: buyer.id,
    items: [{ variantId: variants[i].id, quantity: 1 + (i % 3) }],
    status: ORDER_STATUS.paid,
    orderedAt: hoursAgo(200 - i),
  });
  addParcel(db, { orderId: order.id });
}

const expired = addOrder(db, { buyerAccountId: buyer.id, items: [{ variantId: variants[22].id }], orderedAt: hoursAgo(2) });
db.prepare("UPDATE orders SET status = ?, cancel_reason = 'หมดเวลาจ่ายเงิน', cancelled_at = ? WHERE id = ?").run(
  ORDER_STATUS.cancelled,
  hoursAgo(1.5),
  expired.id,
);

const orderedAt = new Date().toISOString();
const first = addOrder(db, { buyerAccountId: buyer.id, items: [{ variantId: variants[0].id, quantity: 2 }], orderedAt });
const second = addOrder(db, { buyerAccountId: buyer.id, items: [{ variantId: variants[23].id }], orderedAt, groupId: first.groupId });

console.log(`เพิ่มคำสั่งซื้อ 25 รายการให้ ${email} แล้ว รอจ่ายเงิน: ${first.orderNo} ${second.orderNo}`);
db.close();
