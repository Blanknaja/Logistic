// pnpm tsx scripts/demo-parcel.ts
// สร้างคำสั่งซื้อที่จ่ายแล้วของ buyer1@example.com จากร้านของ seller01@example.com พร้อมพัสดุ
// แล้วพิมพ์เลขติดตามพัสดุ ไว้ลองหน้า /parcels/[trackingNo] ก่อนที่การจ่ายเงินจะสร้างพัสดุให้เอง
// รันซ้ำได้ แต่ละครั้งได้คำสั่งซื้อที่สั่งย้อนหลังไปอีกหนึ่งวัน เลขคำสั่งซื้อจึงไม่ซ้ำกัน

import { createParcelForPaidOrder } from "@/features/delivery/server/parcel-status";
import { databasePath, openDb } from "@/shared/db";
import { addOrder } from "@/shared/db/builders";
import { ORDER_STATUS } from "@/shared/statuses";

const db = openDb(databasePath());
const row = db
  .prepare(
    `SELECT b.id AS buyer_id, v.id AS variant_id
     FROM accounts b, accounts s
     JOIN shops sh ON sh.owner_account_id = s.id
     JOIN products p ON p.shop_id = sh.id
     JOIN variants v ON v.product_id = p.id
     WHERE b.email = 'buyer1@example.com' AND s.email = 'seller01@example.com' AND v.price IS NOT NULL
     LIMIT 1`,
  )
  .get() as { buyer_id: number; variant_id: number } | undefined;
if (!row) {
  console.error("ไม่พบข้อมูลตัวอย่าง รัน pnpm seed ก่อน");
  process.exit(1);
}
const { n } = db.prepare("SELECT count(*) AS n FROM orders").get() as { n: number };
const order = addOrder(db, {
  buyerAccountId: row.buyer_id,
  orderedAt: new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString(),
  items: [{ variantId: row.variant_id, quantity: 2 }],
  status: ORDER_STATUS.paid,
});
console.log(createParcelForPaidOrder(db, order.id).trackingNo);
db.close();
