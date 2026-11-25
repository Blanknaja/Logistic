// pnpm tsx scripts/fill-cart.ts buyer1@example.com
// ใส่สินค้า 3 ชิ้นจาก 2 ร้านลงตะกร้าของบัญชีนี้ และเพิ่มที่อยู่หลักถ้ายังไม่มี ไว้ลองหน้าสั่งซื้อ (/checkout)
// เขียนลงฐานข้อมูลของเครื่องนี้ตรงๆ โดยข้ามกฎของตะกร้า

import { databasePath, openDb } from "@/shared/db";
import { addAddress, addCartItem } from "@/shared/db/builders";
import { PRODUCT_STATUS, SHOP_STATUS } from "@/shared/statuses";

const email = process.argv[2];
const db = openDb(databasePath());
const account = email ? db.prepare("SELECT id FROM accounts WHERE email = ?").get(email) : undefined;
if (!account) {
  console.error(`ไม่พบบัญชี ${email ?? ""} ใช้แบบนี้: pnpm tsx scripts/fill-cart.ts buyer1@example.com`);
  process.exit(1);
}
const accountId = Number(account.id);

if (!db.prepare("SELECT 1 FROM shipping_addresses WHERE account_id = ?").get(accountId)) {
  addAddress(db, { accountId, isDefault: true });
}

const variants = db
  .prepare(
    `SELECT v.id, p.shop_id FROM variants v JOIN products p ON p.id = v.product_id JOIN shops s ON s.id = p.shop_id
     WHERE p.status = ? AND s.status = ? AND s.owner_account_id != ? AND v.removed_at IS NULL AND v.price IS NOT NULL AND v.stock >= 2
       AND v.id NOT IN (SELECT variant_id FROM cart_items WHERE account_id = ?)
     ORDER BY random()`,
  )
  .all(PRODUCT_STATUS.onSale, SHOP_STATUS.open, accountId, accountId);
const first = variants[0];
const second = variants.find((row) => row.shop_id !== first?.shop_id);
if (!first || !second) {
  console.error("ไม่มีสินค้าพอให้ใส่ตะกร้า ลอง pnpm seed ก่อน");
  process.exit(1);
}
addCartItem(db, { accountId, variantId: Number(first.id), quantity: 2 });
addCartItem(db, { accountId, variantId: Number(second.id), quantity: 1 });
db.close();
console.log(`ใส่สินค้า 3 ชิ้นจาก 2 ร้านลงตะกร้าของ ${email} แล้ว เปิด /checkout เพื่อลองสั่งซื้อ`);
