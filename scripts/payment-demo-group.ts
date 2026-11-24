// pnpm tsx scripts/payment-demo-group.ts buyer1@example.com
// สร้างกลุ่มคำสั่งซื้อ `รอจ่ายเงิน` จากสองร้านให้บัญชีนี้ในฐานข้อมูลของเครื่อง แล้วพิมพ์ที่อยู่หน้าจ่ายเงิน
// ไว้ลองหน้าจ่ายเงินด้วยมือ เขียนแถวตรงๆ โดยไม่จองสต็อกและไม่เอาของออกจากตะกร้า ซึ่งเป็นกฎของหน้าสั่งซื้อ (CHK)

import { databasePath, openDb, transaction } from "@/shared/db";
import { ORDER_STATUS } from "@/shared/statuses";

const SHIPPING_FEE = 40;
const PAYMENT_WINDOW_MS = 30 * 60 * 1000;

const email = process.argv[2] ?? "buyer1@example.com";
const db = openDb(databasePath());
const account = db.prepare("SELECT id FROM accounts WHERE email = ?").get(email) as { id: number } | undefined;
if (!account) {
  console.error(`ไม่พบบัญชี ${email} รัน pnpm seed ก่อน หรือใช้แบบนี้: pnpm tsx scripts/payment-demo-group.ts buyer1@example.com`);
  process.exit(1);
}

// แบบย่อยที่ขายอยู่หนึ่งแบบจากแต่ละร้าน สองร้านแรกที่ไม่ใช่ร้านของบัญชีนี้
const lines = db
  .prepare(
    `SELECT v.id AS variant_id, v.price, p.id AS product_id, p.name, p.shop_id,
            (SELECT url FROM product_images WHERE product_id = p.id ORDER BY position LIMIT 1) AS cover
     FROM variants v JOIN products p ON p.id = v.product_id JOIN shops s ON s.id = p.shop_id
     WHERE p.status = 'ขายอยู่' AND v.price IS NOT NULL AND v.removed_at IS NULL AND s.owner_account_id != ?
     GROUP BY p.shop_id ORDER BY p.shop_id LIMIT 2`,
  )
  .all(account.id) as { variant_id: number; price: number; product_id: number; name: string; shop_id: number; cover: string | null }[];

const now = new Date();
const groupId = transaction(db, () => {
  const total = lines.reduce((sum, line) => sum + line.price + SHIPPING_FEE, 0);
  const deadline = new Date(now.getTime() + PAYMENT_WINDOW_MS).toISOString();
  const group = Number(
    db
      .prepare("INSERT INTO order_groups (buyer_account_id, total, created_at, payment_deadline) VALUES (?, ?, ?, ?)")
      .run(account.id, total, now.toISOString(), deadline).lastInsertRowid,
  );
  const day = now.toISOString().slice(2, 10).replaceAll("-", "");
  const { count } = db.prepare("SELECT count(*) AS count FROM orders WHERE order_no LIKE ?").get(`${day}%`) as { count: number };
  lines.forEach((line, i) => {
    const orderId = Number(
      db
        .prepare(
          `INSERT INTO orders (order_no, group_id, buyer_account_id, shop_id, status, items_total, shipping_fee, total,
             ship_recipient_name, ship_phone, ship_address, ship_subdistrict, ship_district, ship_province, ship_postcode, ordered_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ผู้รับทดลอง', '0100000000', '99/1 ถนนตัวอย่าง', 'ลุมพินี', 'ปทุมวัน', 'กรุงเทพมหานคร', '10330', ?)`,
        )
        .run(
          `${day}${String(count + i + 1).padStart(4, "0")}`,
          group,
          account.id,
          line.shop_id,
          ORDER_STATUS.awaitingPayment,
          line.price,
          SHIPPING_FEE,
          line.price + SHIPPING_FEE,
          now.toISOString(),
        ).lastInsertRowid,
    );
    db.prepare(
      "INSERT INTO order_items (order_id, product_id, variant_id, product_name, unit_price, quantity, cover_image_url) VALUES (?, ?, ?, ?, ?, 1, ?)",
    ).run(orderId, line.product_id, line.variant_id, line.name, line.price, line.cover);
  });
  return group;
});
db.close();
console.log(`/pay/${groupId}`);
