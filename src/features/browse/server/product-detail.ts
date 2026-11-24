import type { Db } from "@/shared/db";
import { PRODUCT_STATUS, SHOP_STATUS } from "@/shared/statuses";

export type ProductOption = { id: number; name: string; values: { id: number; value: string }[] };

export type ProductVariant = {
  id: number;
  /** ค่าตัวเลือกของแบบย่อยนี้ เรียงตามลำดับตัวเลือก สินค้าที่ไม่มีตัวเลือกเป็นรายการว่าง */
  valueIds: number[];
  label: string;
  price: number;
  stock: number;
};

export type ProductDetail = {
  id: number;
  name: string;
  description: string;
  category: { id: number; name: string } | null;
  shop: { id: number; name: string };
  images: string[];
  options: ProductOption[];
  variants: ProductVariant[];
};

/** สินค้าที่ผู้ซื้อเปิดดูได้ หรือ null ถ้าไม่มี ไม่ขายอยู่ หรือร้านถูกระงับ (BRW-007 BRW-008) */
export function getProductDetail(db: Db, productId: number): ProductDetail | null {
  if (!Number.isSafeInteger(productId)) return null;
  const product = db
    .prepare(
      `SELECT p.id, p.name, p.description, c.id AS category_id, c.name AS category_name, s.id AS shop_id, s.name AS shop_name
       FROM products p
       JOIN shops s ON s.id = p.shop_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.id = ? AND p.status = ? AND s.status = ?`,
    )
    .get(productId, PRODUCT_STATUS.onSale, SHOP_STATUS.open) as
    | {
        id: number;
        name: string;
        description: string;
        category_id: number | null;
        category_name: string | null;
        shop_id: number;
        shop_name: string;
      }
    | undefined;
  if (!product) return null;

  const images = (
    db.prepare("SELECT url FROM product_images WHERE product_id = ? ORDER BY position").all(productId) as { url: string }[]
  ).map((row) => row.url);

  const variantRows = db
    .prepare(
      `SELECT id, option_value1_id, option_value2_id, price, stock FROM variants
       WHERE product_id = ? AND removed_at IS NULL AND price IS NOT NULL
       ORDER BY position`,
    )
    .all(productId) as { id: number; option_value1_id: number | null; option_value2_id: number | null; price: number; stock: number }[];

  const valueRows = db
    .prepare(
      `SELECT o.id AS option_id, o.name AS option_name, v.id, v.value
       FROM product_options o JOIN product_option_values v ON v.option_id = o.id
       WHERE o.product_id = ?
       ORDER BY o.position, v.position`,
    )
    .all(productId) as { option_id: number; option_name: string; id: number; value: string }[];

  const usedValueIds = new Set(variantRows.flatMap((row) => [row.option_value1_id, row.option_value2_id]));
  const options: ProductOption[] = [];
  const valueById = new Map<number, { optionIndex: number; value: string }>();
  for (const row of valueRows) {
    if (!usedValueIds.has(row.id)) continue;
    let option = options.find((o) => o.id === row.option_id);
    if (!option) {
      option = { id: row.option_id, name: row.option_name, values: [] };
      options.push(option);
    }
    option.values.push({ id: row.id, value: row.value });
    valueById.set(row.id, { optionIndex: options.indexOf(option), value: row.value });
  }

  const variants = variantRows.map((row) => {
    const valueIds: number[] = [];
    const labels: string[] = [];
    for (const valueId of [row.option_value1_id, row.option_value2_id]) {
      const value = valueId === null ? undefined : valueById.get(valueId);
      if (!value || valueId === null) continue;
      valueIds[value.optionIndex] = valueId;
      labels[value.optionIndex] = value.value;
    }
    return { id: row.id, valueIds, label: labels.join(" "), price: row.price, stock: row.stock };
  });

  return {
    id: product.id,
    name: product.name,
    description: product.description,
    category: product.category_id === null ? null : { id: product.category_id, name: product.category_name ?? "" },
    shop: { id: product.shop_id, name: product.shop_name },
    images,
    options,
    variants,
  };
}
