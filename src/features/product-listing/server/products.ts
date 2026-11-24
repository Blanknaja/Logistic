import { transaction, type Db } from "@/shared/db";
import { PAGE_SIZE, pageCount } from "@/shared/paging";
import type { Checked } from "@/shared/result";
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

/** ตรวจข้อมูลกับฐานข้อมูลเพิ่มจาก validateProduct() รูปต้องเป็นรูปที่ร้านส่งขึ้นมาเอง หรือรูปเดิมของสินค้านี้ */
function checkValues(db: Db, shopId: number, values: ProductValues, intent: SaveIntent, keptImages: string[] = []): ProductErrors {
  const errors = validateProduct(values, intent);
  if (values.categoryId !== null && !db.prepare("SELECT 1 FROM categories WHERE id = ?").get(values.categoryId)) {
    errors.categoryId = MESSAGES.categoryRequired;
  }
  if (!errors.images && !values.images.every((url) => keptImages.includes(url) || isShopUpload(db, shopId, url))) {
    errors.images = MESSAGES.imageNotFound;
  }
  return errors;
}

/** เขียนรูปและตัวเลือกของสินค้า คืนรหัสค่าตัวเลือกของแบบย่อยแต่ละแบบ พร้อมราคา ตามลำดับของ variantCombos() */
function writeImagesAndOptions(db: Db, productId: number, values: ProductValues, at: string) {
  const addImage = db.prepare("INSERT INTO product_images (product_id, url, position, created_at) VALUES (?, ?, ?, ?)");
  values.images.forEach((url, position) => addImage.run(productId, url, position, at));

  const addOption = db.prepare("INSERT INTO product_options (product_id, name, position) VALUES (?, ?, ?)");
  const addValue = db.prepare("INSERT INTO product_option_values (option_id, value, position) VALUES (?, ?, ?)");
  const valueIds = values.options.map((option, position) => {
    const optionId = Number(addOption.run(productId, option.name.trim(), position).lastInsertRowid);
    return option.values.map((value, i) => Number(addValue.run(optionId, value.trim(), i).lastInsertRowid));
  });

  const labels = cartesian(values.options.map((option) => option.values));
  return cartesian(valueIds).map(([value1 = null, value2 = null], i) => ({
    value1,
    value2,
    labelKey: variantKey(labels[i]),
    price: parsePrice(values.prices[JSON.stringify(labels[i])] ?? ""),
  }));
}

/** ค่าตัวเลือกที่ต่างกันแค่ตัวพิมพ์เล็กใหญ่ถือว่าเป็นแบบย่อยเดียวกัน */
const variantKey = (labels: string[]) => JSON.stringify(labels.map((label) => label.trim().toLowerCase()));

/**
 * สร้างสินค้าในร้าน (PRD-002 ถึง PRD-005) ร้านมาจากบัญชีที่เข้าสู่ระบบเสมอ ไม่รับจากหน้าเว็บ
 * แบบย่อยใหม่เริ่มที่สต็อก 0 ผู้ขายตั้งสต็อกเองที่หน้าสต็อก
 * createToken มาจากหน้าฟอร์มหนึ่งครั้ง ส่งซ้ำด้วยรหัสเดิมได้สินค้าชิ้นเดิม ไม่สร้างใหม่ (PRD-013)
 */
export function createProduct(
  db: Db,
  shopId: number,
  values: ProductValues,
  intent: SaveIntent,
  now: Date = new Date(),
  createToken: string | null = null,
): Checked<{ productId: number }, ProductErrors> {
  return transaction(db, () => {
    const existing = db.prepare("SELECT id FROM products WHERE shop_id = ? AND create_token = ?").get(shopId, createToken);
    if (existing) return { ok: true as const, productId: Number(existing.id) };

    const errors = checkValues(db, shopId, values, intent);
    if (Object.keys(errors).length > 0) return { ok: false as const, errors };

    const at = now.toISOString();
    const id = Number(
      db
        .prepare(
          `INSERT INTO products (shop_id, category_id, name, description, status, created_at, updated_at, published_at, create_token)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          createToken,
        ).lastInsertRowid,
    );

    const addVariant = db.prepare(
      `INSERT INTO variants (product_id, option_value1_id, option_value2_id, price, stock, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
    );
    writeImagesAndOptions(db, id, values, at).forEach((variant, position) => {
      addVariant.run(id, variant.value1, variant.value2, variant.price, position, at, at);
    });
    return { ok: true as const, productId: id };
  });
}

/** สินค้าที่เปิดในหน้าฟอร์มเพื่อแก้ไข (PRD-006) updatedAt ใช้ตรวจว่ามีใครแก้ไปก่อนตอนบันทึก (PRD-013) */
export type EditableProduct = { id: number; status: ListedStatus; updatedAt: string; values: ProductValues };

/** สินค้าของร้านนี้ที่ยังไม่ถูกลบ หรือ null ทั้งตอนไม่มี ถูกลบแล้ว และเป็นของร้านอื่น (PRD-006 PRD-012) */
export function getProductForEdit(db: Db, shopId: number, productId: number): EditableProduct | null {
  const product = db
    .prepare("SELECT id, name, description, category_id, status, updated_at FROM products WHERE id = ? AND shop_id = ? AND status != ?")
    .get(productId, shopId, PRODUCT_STATUS.deleted) as
    | { id: number; name: string; description: string; category_id: number | null; status: ListedStatus; updated_at: string }
    | undefined;
  if (!product) return null;

  const images = db.prepare("SELECT url FROM product_images WHERE product_id = ? ORDER BY position").all(productId) as { url: string }[];
  const options = db
    .prepare("SELECT id, name FROM product_options WHERE product_id = ? AND removed_at IS NULL ORDER BY position")
    .all(productId) as { id: number; name: string }[];
  const valuesOf = db.prepare("SELECT value FROM product_option_values WHERE option_id = ? ORDER BY position");
  const variants = db
    .prepare(
      `SELECT v.price, ov1.value AS value1, ov2.value AS value2 FROM variants v
       LEFT JOIN product_option_values ov1 ON ov1.id = v.option_value1_id
       LEFT JOIN product_option_values ov2 ON ov2.id = v.option_value2_id
       WHERE v.product_id = ? AND v.removed_at IS NULL ORDER BY v.position`,
    )
    .all(productId) as { price: number | null; value1: string | null; value2: string | null }[];

  return {
    id: product.id,
    status: product.status,
    updatedAt: product.updated_at,
    values: {
      name: product.name,
      description: product.description,
      categoryId: product.category_id,
      images: images.map((row) => row.url),
      options: options.map((option) => ({
        name: option.name,
        values: (valuesOf.all(option.id) as { value: string }[]).map((row) => row.value),
      })),
      prices: Object.fromEntries(
        variants.map((row) => [
          JSON.stringify([row.value1, row.value2].filter((value) => value !== null)),
          row.price === null ? "" : String(row.price),
        ]),
      ),
    },
  };
}

export type UpdateResult =
  | { ok: true; from: ListedStatus; to: ListedStatus }
  | { ok: false; errors: ProductErrors }
  /** มีคนบันทึกสินค้านี้ไปหลังจากเปิดหน้าฟอร์ม (PRD-013) */
  | { ok: false; changedAt: string };

/**
 * บันทึกการแก้ไขสินค้า (PRD-007) คืน null ถ้าไม่พบ ถูกลบแล้ว หรือเป็นของร้านอื่น
 * version คือ updatedAt ตอนเปิดหน้าฟอร์ม ถ้าไม่ตรงกับปัจจุบันจะไม่เขียนทับ (PRD-013)
 * แบบย่อยที่ค่าตัวเลือกยังเหมือนเดิมใช้แถวเดิม สต็อกและตะกร้าจึงยังผูกอยู่ แบบย่อยที่หายไปถูกเลิกใช้ ไม่ลบ (PRD-010)
 */
export function updateProduct(
  db: Db,
  shopId: number,
  productId: number,
  version: string,
  values: ProductValues,
  intent: SaveIntent,
  now: Date = new Date(),
): UpdateResult | null {
  return transaction(db, (): UpdateResult | null => {
    const current = getProductForEdit(db, shopId, productId);
    if (!current) return null;
    if (current.updatedAt !== version) return { ok: false, changedAt: current.updatedAt };

    const draft = current.status === PRODUCT_STATUS.draft;
    // ขายอยู่ และ ซ่อน กลับเป็นร่างไม่ได้ จึงต้องข้อมูลครบเสมอ
    const errors = checkValues(db, shopId, values, draft ? intent : "publish", current.values.images);
    if (Object.keys(errors).length > 0) return { ok: false, errors };

    const at = now.toISOString();
    const status = draft && intent === "publish" ? PRODUCT_STATUS.onSale : current.status;
    db.prepare(
      `UPDATE products SET category_id = ?, name = ?, description = ?, status = ?, updated_at = ?,
         published_at = coalesce(published_at, ?)
       WHERE id = ?`,
    ).run(values.categoryId, values.name.trim(), values.description.trim(), status, at, status === PRODUCT_STATUS.onSale ? at : null, productId);

    const oldVariants = db
      .prepare(
        `SELECT v.id, ov1.value AS value1, ov2.value AS value2 FROM variants v
         LEFT JOIN product_option_values ov1 ON ov1.id = v.option_value1_id
         LEFT JOIN product_option_values ov2 ON ov2.id = v.option_value2_id
         WHERE v.product_id = ? AND v.removed_at IS NULL`,
      )
      .all(productId) as { id: number; value1: string | null; value2: string | null }[];
    const unmatched = new Map(
      oldVariants.map((row) => [variantKey([row.value1, row.value2].filter((value) => value !== null)), row.id]),
    );

    db.prepare("DELETE FROM product_images WHERE product_id = ?").run(productId);
    db.prepare("UPDATE product_options SET removed_at = ? WHERE product_id = ? AND removed_at IS NULL").run(at, productId);

    const reuse = db.prepare(
      "UPDATE variants SET option_value1_id = ?, option_value2_id = ?, price = ?, position = ?, updated_at = ? WHERE id = ?",
    );
    const addVariant = db.prepare(
      `INSERT INTO variants (product_id, option_value1_id, option_value2_id, price, stock, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
    );
    writeImagesAndOptions(db, productId, values, at).forEach((variant, position) => {
      const variantId = unmatched.get(variant.labelKey);
      unmatched.delete(variant.labelKey);
      if (variantId === undefined) addVariant.run(productId, variant.value1, variant.value2, variant.price, position, at, at);
      else reuse.run(variant.value1, variant.value2, variant.price, position, at, variantId);
    });
    const retire = db.prepare("UPDATE variants SET removed_at = ?, updated_at = ? WHERE id = ?");
    for (const variantId of unmatched.values()) retire.run(at, at, variantId);

    return { ok: true, from: current.status, to: status };
  });
}

/**
 * ซ่อนสินค้าที่ ขายอยู่ หรือเลิกซ่อนสินค้าที่ ซ่อน (PRD-008) ไม่เปลี่ยนข้อมูลอื่นรวมถึงเวลาที่แก้ล่าสุด
 * คืน false ถ้าไม่พบ เป็นของร้านอื่น หรือสถานะไม่ตรง เช่นร่าง
 */
export function setProductHidden(db: Db, shopId: number, productId: number, hidden: boolean): boolean {
  const [from, to] = hidden ? [PRODUCT_STATUS.onSale, PRODUCT_STATUS.hidden] : [PRODUCT_STATUS.hidden, PRODUCT_STATUS.onSale];
  return db.prepare("UPDATE products SET status = ? WHERE id = ? AND shop_id = ? AND status = ?").run(to, productId, shopId, from).changes > 0;
}

/**
 * ลบสินค้า (PRD-009) กู้กลับไม่ได้ ข้อมูลยังเก็บไว้ เพราะคำสั่งซื้อและตะกร้าเดิมยังอ้างถึง (PRD-010 PRD-011)
 * คืน false ถ้าไม่พบ ถูกลบไปแล้ว หรือเป็นของร้านอื่น
 */
export function deleteProduct(db: Db, shopId: number, productId: number, now: Date = new Date()): boolean {
  return (
    db
      .prepare("UPDATE products SET status = ?, deleted_at = ? WHERE id = ? AND shop_id = ? AND status != ?")
      .run(PRODUCT_STATUS.deleted, now.toISOString(), productId, shopId, PRODUCT_STATUS.deleted).changes > 0
  );
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
  const pages = pageCount(total);
  const requested = Number.isSafeInteger(filter.page) ? (filter.page as number) : 1;
  const page = Math.min(Math.max(1, requested), pages);

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
    pageCount: pages,
  };
}
