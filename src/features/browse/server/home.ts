import type { ProductCard } from "@/features/browse/server/search";
import { searchProducts } from "@/features/browse/server/search";
import type { Db } from "@/shared/db";
import { PRODUCT_STATUS, SHOP_STATUS } from "@/shared/statuses";

/** ราคาสูงสุดของชั้น "ราคาเบาๆ" ในหน้าแรก ลิงก์ "ดูทั้งหมด" ใช้ตัวกรองราคาเดียวกัน */
export const BUDGET_MAX = 300;
const FEATURED_SHOPS = 6;

export type CategoryCover = { id: number; name: string; coverUrl: string | null };

export type FeaturedShop = {
  id: number;
  name: string;
  logoUrl: string | null;
  productCount: number;
  /** รูปปกของสินค้าล่าสุดไม่เกิน 3 ชิ้น */
  covers: string[];
};

export type HomeSections = { categories: CategoryCover[]; budget: ProductCard[]; shops: FeaturedShop[] };

const VISIBLE = `p.status = ? AND s.status = ?`;

/** ของที่หน้าแรกวางก่อนรายการสินค้าทั้งหมด: การ์ดหมวดที่มีรูป ชั้นราคาเบาๆ และร้านที่มีสินค้ามากที่สุด */
export function getHomeSections(db: Db): HomeSections {
  const visible = [PRODUCT_STATUS.onSale, SHOP_STATUS.open];

  // รูปถ่ายจริงมาก่อนรูปแทนของข้อมูลตัวอย่าง
  const cover = db.prepare(
    `SELECT i.url FROM products p
     JOIN shops s ON s.id = p.shop_id
     JOIN product_images i ON i.product_id = p.id AND i.position = (SELECT min(position) FROM product_images WHERE product_id = p.id)
     WHERE p.category_id = ? AND ${VISIBLE}
     ORDER BY i.url LIKE '/sample-images/%', p.published_at DESC, p.id DESC LIMIT 1`,
  );
  const categories = (db.prepare("SELECT id, name FROM categories ORDER BY position").all() as { id: number; name: string }[]).map(
    ({ id, name }) => ({ id, name, coverUrl: (cover.get(id, ...visible)?.url as string | undefined) ?? null }),
  );

  const budget = searchProducts(db, { q: "", category: null, min: null, max: BUDGET_MAX, rating: null, sort: "newest", page: 1 }).items;

  const covers = db.prepare(
    `SELECT i.url FROM products p
     JOIN product_images i ON i.product_id = p.id AND i.position = (SELECT min(position) FROM product_images WHERE product_id = p.id)
     WHERE p.shop_id = ? AND p.status = ?
     ORDER BY i.url LIKE '/sample-images/%', p.published_at DESC, p.id DESC LIMIT 3`,
  );
  const shops = (
    db
      .prepare(
        `SELECT s.id, s.name, s.logo_url, count(*) AS n FROM shops s
         JOIN products p ON p.shop_id = s.id
         WHERE ${VISIBLE}
         GROUP BY s.id ORDER BY n DESC, s.id LIMIT ?`,
      )
      .all(...visible, FEATURED_SHOPS) as { id: number; name: string; logo_url: string | null; n: number }[]
  ).map((row) => ({
    id: row.id,
    name: row.name,
    logoUrl: row.logo_url,
    productCount: row.n,
    covers: (covers.all(row.id, PRODUCT_STATUS.onSale) as { url: string }[]).map((image) => image.url),
  }));

  return { categories, budget, shops };
}
