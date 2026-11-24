import type { ProductCard } from "@/features/browse/server/search";
import type { Db } from "@/shared/db";
import { PRODUCT_STATUS, SHOP_STATUS, type ShopStatus } from "@/shared/statuses";
import { countShopProducts } from "./shops";

export const STOREFRONT_PAGE_SIZE = 20;

/**
 * ข้อมูลร้านที่ทุกคนเห็นในหน้าร้าน (SHP-011)
 * ไม่มีชื่อผู้ส่ง เบอร์โทร และที่อยู่ต้นทางส่วนอื่นนอกจากจังหวัด (SHP-Q05)
 */
export type Storefront = {
  id: number;
  name: string;
  description: string;
  logoUrl: string | null;
  province: string;
  openedAt: string;
  status: ShopStatus;
  productCount: number;
};

export type StorefrontProduct = Omit<ProductCard, "shopName">;

/** ตำแหน่งของสินค้าชิ้นสุดท้ายที่แสดงแล้ว ชุดถัดไปเริ่มต่อจากนี้ สินค้าที่ลงใหม่ระหว่างนั้นจึงไม่ทำให้ซ้ำ */
export type StorefrontCursor = { publishedAt: string; id: number };

export type StorefrontPage = { items: StorefrontProduct[]; next: StorefrontCursor | null };

export function getStorefront(db: Db, shopId: number): Storefront | null {
  const row = db
    .prepare("SELECT id, name, description, logo_url, origin_province, opened_at, status FROM shops WHERE id = ?")
    .get(shopId) as
    | { id: number; name: string; description: string; logo_url: string | null; origin_province: string; opened_at: string; status: ShopStatus }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    logoUrl: row.logo_url,
    province: row.origin_province,
    openedAt: row.opened_at,
    status: row.status,
    // ร้านที่ถูกระงับไม่แสดงสินค้า (SHP-014)
    productCount: row.status === SHOP_STATUS.open ? countShopProducts(db, row.id).onSale : 0,
  };
}

/** สินค้าที่ขายอยู่ของร้านที่เปิดอยู่ ลงล่าสุดก่อน ครั้งละ 20 ชิ้น ส่ง after เพื่อเอาชุดถัดไป (SHP-011) */
export function listStorefrontProducts(db: Db, shopId: number, after: StorefrontCursor | null = null): StorefrontPage {
  const rows = db
    .prepare(
      `SELECT p.id, p.name, p.published_at, min(v.price) AS price, sum(v.stock) AS stock,
         (SELECT url FROM product_images i WHERE i.product_id = p.id ORDER BY i.position LIMIT 1) AS cover_url
       FROM products p
       JOIN shops s ON s.id = p.shop_id
       JOIN variants v ON v.product_id = p.id AND v.removed_at IS NULL AND v.price IS NOT NULL
       WHERE p.shop_id = ? AND p.status = ? AND s.status = ?
         AND (? IS NULL OR (p.published_at, p.id) < (?, ?))
       GROUP BY p.id
       ORDER BY p.published_at DESC, p.id DESC
       LIMIT ?`,
    )
    .all(
      shopId,
      PRODUCT_STATUS.onSale,
      SHOP_STATUS.open,
      after?.publishedAt ?? null,
      after?.publishedAt ?? null,
      after?.id ?? null,
      STOREFRONT_PAGE_SIZE + 1,
    ) as { id: number; name: string; published_at: string; price: number; stock: number; cover_url: string | null }[];

  const items = rows.slice(0, STOREFRONT_PAGE_SIZE).map((row) => ({
    id: row.id,
    name: row.name,
    price: row.price,
    coverUrl: row.cover_url,
    soldOut: row.stock <= 0,
  }));
  const last = rows[STOREFRONT_PAGE_SIZE - 1];
  return { items, next: rows.length > STOREFRONT_PAGE_SIZE ? { publishedAt: last.published_at, id: last.id } : null };
}
