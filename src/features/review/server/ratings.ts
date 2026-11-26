import { displayedAverage, type Rating } from "@/features/review/rules";
import type { Db } from "@/shared/db";
import { REVIEW_STATUS } from "@/shared/statuses";

// คะแนนเฉลี่ยคิดจากรีวิวที่ `แสดงอยู่` ทุกครั้งที่อ่าน จึงเปลี่ยนตามทันทีที่รีวิวเปลี่ยน (REV-Q03)

/**
 * จำนวนรีวิวและคะแนนเฉลี่ยคูณ 10 ของแต่ละสินค้า สำหรับ LEFT JOIN ... r ON r.product_id = p.id
 * สูตรเดียวกับ averageTenths การเรียงและตัวกรองจึงใช้ค่าเดียวกับที่ผู้ซื้อเห็น (REV-010 REV-011)
 */
export const PRODUCT_RATINGS_SQL = `(
  SELECT product_id, count(*) AS review_count, (sum(rating) * 20 + count(*)) / (2 * count(*)) AS rating_tenths
  FROM reviews WHERE status = '${REVIEW_STATUS.visible}' GROUP BY product_id
)`;

/** แถวที่ JOIN กับ PRODUCT_RATINGS_SQL เป็นช่อง rating ของการ์ดสินค้า ไม่มีรีวิวที่ `แสดงอยู่` ไม่มีช่องนี้ (REV-009) */
export const ratingField = (row: { review_count: number | null; rating_tenths: number | null }): { rating?: Rating } =>
  row.review_count && row.rating_tenths !== null ? { rating: { average: row.rating_tenths / 10, count: row.review_count } } : {};

export type Stars = 1 | 2 | 3 | 4 | 5;

/** คะแนนเฉลี่ย จำนวนรีวิว และจำนวนรีวิวของแต่ละดาว stars[5] คือจำนวนรีวิว 5 ดาว */
export type RatingSummary = Rating & { stars: Record<Stars, number> };

function summarize(db: Db, column: "product_id" | "shop_id", id: number): RatingSummary | null {
  const rows = db
    .prepare(`SELECT rating, count(*) AS n FROM reviews WHERE ${column} = ? AND status = ? GROUP BY rating`)
    .all(id, REVIEW_STATUS.visible) as { rating: Stars; n: number }[];
  const stars = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let count = 0;
  let sum = 0;
  for (const row of rows) {
    stars[row.rating] = row.n;
    count += row.n;
    sum += row.rating * row.n;
  }
  return count === 0 ? null : { average: displayedAverage(sum, count), count, stars };
}

/** สรุปคะแนนของสินค้าทุกแบบย่อยรวมกัน null ถ้าไม่มีรีวิวที่ `แสดงอยู่` (REV-006) */
export const productRating = (db: Db, productId: number) => summarize(db, "product_id", productId);

/** สรุปคะแนนของร้านจากรีวิวทีละรีวิวของสินค้าทุกชิ้น รวมสินค้าที่ร้านซ่อนหรือลบแล้ว (REV-013) */
export const shopRating = (db: Db, shopId: number) => summarize(db, "shop_id", shopId);
