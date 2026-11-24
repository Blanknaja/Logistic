import type { Db } from "@/shared/db";
import { PRODUCT_STATUS, SHOP_STATUS } from "@/shared/statuses";

/** จำนวนสินค้าที่ผู้ซื้อเห็นได้ คือสินค้าที่ขายอยู่ของร้านที่เปิดอยู่ รวมที่สินค้าหมด */
export function countVisibleProducts(db: Db): number {
  const row = db
    .prepare(
      `SELECT count(*) AS n FROM products p JOIN shops s ON s.id = p.shop_id
       WHERE p.status = ? AND s.status = ?`,
    )
    .get(PRODUCT_STATUS.onSale, SHOP_STATUS.open);
  return Number(row?.n);
}
