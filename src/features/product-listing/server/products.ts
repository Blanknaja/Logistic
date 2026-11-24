import { transaction, type Db } from "@/shared/db";
import { PRODUCT_STATUS, type ProductStatus } from "@/shared/statuses";
import { isShopUpload } from "./image-files";
import {
  cartesian,
  MESSAGES,
  parsePrice,
  validateProduct,
  type ProductErrors,
  type ProductValues,
  type SaveIntent,
} from "./product-rules";

/** หน้ารายการสินค้าของร้านแสดงหน้าละ 20 ชิ้น (PRD-001) */
export const PAGE_SIZE = 20;

/** สถานะที่ผู้ขายเห็นในหน้ารายการสินค้าของร้าน สินค้าที่ลบแล้วไม่แสดง */
export type ListedStatus = Exclude<ProductStatus, typeof PRODUCT_STATUS.deleted>;

export type ShopProductRow = {
  id: number;
  name: string;
  status: ListedStatus;
  coverUrl: string | null;
  /** ราคาต่ำสุดและสูงสุดของแบบย่อยที่ตั้งราคาแล้ว null ถ้ายังไม่ตั้งเลย */
  minPrice: number | null;
  maxPrice: number | null;
  totalStock: number;
  updatedAt: string;
};

/**
 * สร้างสินค้าในร้าน (PRD-002 ถึง PRD-005) ร้านมาจากบัญชีที่เข้าสู่ระบบเสมอ ไม่รับจากหน้าเว็บ
 * แบบย่อยใหม่เริ่มที่สต็อก 0 ผู้ขายตั้งสต็อกเองที่หน้าสต็อก
 */
export function createProduct(
  db: Db,
  shopId: number,
  values: ProductValues,
  intent: SaveIntent,
  now: Date = new Date(),
): { ok: true; productId: number } | { ok: false; errors: ProductErrors } {
  const errors = validateProduct(values, intent);
  if (values.categoryId !== null && !db.prepare("SELECT 1 FROM categories WHERE id = ?").get(values.categoryId)) {
    errors.categoryId = MESSAGES.categoryRequired;
  }
  if (!errors.images && !values.images.every((url) => isShopUpload(db, shopId, url))) {
    errors.images = MESSAGES.imageNotFound;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const at = now.toISOString();
  const productId = transaction(db, () => {
    const id = Number(
      db
        .prepare(
          `INSERT INTO products (shop_id, category_id, name, description, status, created_at, updated_at, published_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          shopId,
          values.categoryId,
          values.name.trim(),
          values.description.trim(),
          intent === "publish" ? PRODUCT_STATUS.onSale : PRODUCT_STATUS.draft,
          at,
          at,
          intent === "publish" ? at : null,
        ).lastInsertRowid,
    );

    const addImage = db.prepare("INSERT INTO product_images (product_id, url, position, created_at) VALUES (?, ?, ?, ?)");
    values.images.forEach((url, position) => addImage.run(id, url, position, at));

    const addOption = db.prepare("INSERT INTO product_options (product_id, name, position) VALUES (?, ?, ?)");
    const addValue = db.prepare("INSERT INTO product_option_values (option_id, value, position) VALUES (?, ?, ?)");
    const valueIds = values.options.map((option, position) => {
      const optionId = Number(addOption.run(id, option.name.trim(), position).lastInsertRowid);
      return option.values.map((value, i) => Number(addValue.run(optionId, value.trim(), i).lastInsertRowid));
    });

    // ลำดับเดียวกับ variantCombos() ราคาที่หน้าเว็บส่งมาจึงตรงแบบย่อย
    const priceTexts = cartesian(values.options.map((option) => option.values)).map(
      (combo) => values.prices[JSON.stringify(combo)] ?? "",
    );
    const addVariant = db.prepare(
      `INSERT INTO variants (product_id, option_value1_id, option_value2_id, price, stock, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
    );
    cartesian(valueIds).forEach(([value1 = null, value2 = null], position) => {
      addVariant.run(id, value1, value2, parsePrice(priceTexts[position]), position, at, at);
    });
    return id;
  });
  return { ok: true, productId };
}

/** จำนวนสินค้าของร้านในแต่ละสถานะ สำหรับตัวกรอง ไม่ขึ้นกับคำค้นหา (PRD-001) */
export function countShopProducts(db: Db, shopId: number): Record<"all" | ListedStatus, number> {
  const rows = db
    .prepare("SELECT status, count(*) AS n FROM products WHERE shop_id = ? AND status != ? GROUP BY status")
    .all(shopId, PRODUCT_STATUS.deleted) as { status: ListedStatus; n: number }[];
  const counts = { all: 0, [PRODUCT_STATUS.onSale]: 0, [PRODUCT_STATUS.hidden]: 0, [PRODUCT_STATUS.draft]: 0 };
  for (const row of rows) {
    counts[row.status] = row.n;
    counts.all += row.n;
  }
  return counts;
}

/** สินค้าของร้านที่ยังไม่ถูกลบ เรียงจากชิ้นที่แก้ล่าสุด หน้าละ 20 ชิ้น (PRD-001) */
export function listShopProducts(
  db: Db,
  shopId: number,
  filter: { status?: ListedStatus; q?: string; page?: number },
): { items: ShopProductRow[]; total: number; page: number; pageCount: number } {
  const where = ["p.shop_id = ?", "p.status != ?"];
  const params: (string | number)[] = [shopId, PRODUCT_STATUS.deleted];
  if (filter.status) {
    where.push("p.status = ?");
    params.push(filter.status);
  }
  const q = filter.q?.trim();
  if (q) {
    where.push("instr(lower(p.name), lower(?)) > 0");
    params.push(q);
  }
  const conditions = where.join(" AND ");

  const total = Number(db.prepare(`SELECT count(*) AS n FROM products p WHERE ${conditions}`).get(...params)?.n);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const requested = Number.isSafeInteger(filter.page) ? (filter.page as number) : 1;
  const page = Math.min(Math.max(1, requested), pageCount);

  const rows = db
    .prepare(
      `SELECT p.id, p.name, p.status, p.updated_at,
         (SELECT url FROM product_images WHERE product_id = p.id ORDER BY position LIMIT 1) AS cover_url,
         (SELECT min(price) FROM variants WHERE product_id = p.id AND removed_at IS NULL) AS min_price,
         (SELECT max(price) FROM variants WHERE product_id = p.id AND removed_at IS NULL) AS max_price,
         (SELECT coalesce(sum(stock), 0) FROM variants WHERE product_id = p.id AND removed_at IS NULL) AS total_stock
       FROM products p
       WHERE ${conditions}
       ORDER BY p.updated_at DESC, p.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, PAGE_SIZE, (page - 1) * PAGE_SIZE) as {
    id: number;
    name: string;
    status: ListedStatus;
    updated_at: string;
    cover_url: string | null;
    min_price: number | null;
    max_price: number | null;
    total_stock: number;
  }[];

  return {
    items: rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      coverUrl: row.cover_url,
      minPrice: row.min_price,
      maxPrice: row.max_price,
      totalStock: row.total_stock,
      updatedAt: row.updated_at,
    })),
    total,
    page,
    pageCount,
  };
}
