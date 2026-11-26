import { priceError, type BrowseParams, type Sort } from "@/features/browse/search-params";
import type { Category } from "@/features/product-listing/server/categories";
import type { Rating } from "@/features/review/rules";
import { PRODUCT_RATINGS_SQL, ratingField } from "@/features/review/server/ratings";
import type { Db } from "@/shared/db";
import { PAGE_SIZE } from "@/shared/paging";
import { PRODUCT_STATUS, SHOP_STATUS } from "@/shared/statuses";

export type ProductCard = {
  id: number;
  name: string;
  /** ราคาต่ำสุดของแบบย่อยที่ยังใช้อยู่ */
  price: number;
  shopName: string;
  coverUrl: string | null;
  soldOut: boolean;
  /** คะแนนเฉลี่ยและจำนวนรีวิวที่ `แสดงอยู่` ไม่มีรีวิวไม่มีช่องนี้ (REV-009) */
  rating?: Rating;
};

export type SearchResult = {
  items: ProductCard[];
  total: number;
  /** หน้าที่แสดงจริง ถ้าหน้าที่ขอเกินหน้าสุดท้ายจะเป็นหน้าสุดท้าย */
  page: number;
  totalPages: number;
  category: Category | null;
  categoryNotFound: boolean;
  /** ช่วงราคาใช้ไม่ได้ จึงไม่ได้กรองราคา */
  priceError: string | null;
};

// ราคาเท่ากันให้สินค้าที่ลงขายใหม่กว่าขึ้นก่อน (BRW-005)
const ORDER_BY: Record<Sort, string> = {
  newest: "p.published_at DESC, p.id DESC",
  "price-asc": "price ASC, p.published_at DESC, p.id DESC",
  "price-desc": "price DESC, p.published_at DESC, p.id DESC",
  // คะแนนเท่ากันให้สินค้าที่รีวิวมากกว่าขึ้นก่อน สินค้าที่ไม่มีรีวิวอยู่ท้ายสุด (REV-010)
  rating: "r.rating_tenths IS NULL, r.rating_tenths DESC, r.review_count DESC, p.published_at DESC, p.id DESC",
};

/** สินค้าที่ผู้ซื้อเห็นได้ตามคำค้นและตัวกรอง หน้าละ 20 รายการ (BRW-001 ถึง BRW-007) */
export function searchProducts(db: Db, params: BrowseParams): SearchResult {
  const error = priceError(params.min, params.max);
  let category: Category | null = null;
  if (params.category !== null) {
    category = /^\d+$/.test(params.category)
      ? ((db.prepare("SELECT id, name FROM categories WHERE id = ?").get(Number(params.category)) as Category | undefined) ?? null)
      : null;
    if (!category) {
      return { items: [], total: 0, page: 1, totalPages: 0, category: null, categoryNotFound: true, priceError: error };
    }
  }

  const where = ["p.status = ?", "s.status = ?"];
  const whereArgs: (string | number)[] = [PRODUCT_STATUS.onSale, SHOP_STATUS.open];
  // ชื่อสินค้าต้องมีทุกคำ คำเรียงสลับกันได้ (SNT-007)
  for (const word of params.q.split(/\s+/).filter(Boolean)) {
    // instr ไม่มีอักษรพิเศษแบบ LIKE ส่วน lower แปลงเฉพาะอักษรอังกฤษ
    where.push("instr(lower(p.name), lower(?)) > 0");
    whereArgs.push(word);
  }
  if (category) {
    where.push("p.category_id = ?");
    whereArgs.push(category.id);
  }
  const having = ["1"];
  const havingArgs: number[] = [];
  if (!error && params.min !== null) {
    having.push("price >= ?");
    havingArgs.push(params.min);
  }
  if (!error && params.max !== null) {
    having.push("price <= ?");
    havingArgs.push(params.max);
  }
  // สินค้าที่ไม่มีรีวิวมีคะแนนเป็น NULL จึงไม่ผ่านตัวกรองนี้ (REV-011)
  if (params.rating !== null) {
    having.push("r.rating_tenths >= ?");
    havingArgs.push(params.rating * 10);
  }

  const listed = `
    SELECT p.id, p.name, p.published_at, s.name AS shop_name, min(v.price) AS price, sum(v.stock) AS stock,
      r.review_count, r.rating_tenths
    FROM products p
    JOIN shops s ON s.id = p.shop_id
    JOIN variants v ON v.product_id = p.id AND v.removed_at IS NULL AND v.price IS NOT NULL
    LEFT JOIN ${PRODUCT_RATINGS_SQL} r ON r.product_id = p.id
    WHERE ${where.join(" AND ")}
    GROUP BY p.id
    HAVING ${having.join(" AND ")}`;
  const args = [...whereArgs, ...havingArgs];

  const total = Number(db.prepare(`SELECT count(*) AS n FROM (${listed})`).get(...args)?.n);
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const page = Math.min(params.page, Math.max(totalPages, 1));

  const rows = db
    .prepare(
      `${listed}
       ORDER BY ${ORDER_BY[params.sort]}
       LIMIT ? OFFSET ?`,
    )
    .all(...args, PAGE_SIZE, (page - 1) * PAGE_SIZE) as {
    id: number;
    name: string;
    shop_name: string;
    price: number;
    stock: number;
    review_count: number | null;
    rating_tenths: number | null;
  }[];

  const cover = db.prepare("SELECT url FROM product_images WHERE product_id = ? ORDER BY position LIMIT 1");
  const items = rows.map((row) => ({
    id: row.id,
    name: row.name,
    price: row.price,
    shopName: row.shop_name,
    coverUrl: (cover.get(row.id)?.url as string | undefined) ?? null,
    soldOut: row.stock <= 0,
    ...ratingField(row),
  }));

  return { items, total, page, totalPages, category, categoryNotFound: false, priceError: error };
}
