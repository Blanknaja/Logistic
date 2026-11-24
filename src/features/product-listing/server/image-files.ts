import { randomUUID } from "node:crypto";
import type { Db } from "@/shared/db";
import { LIMITS, MESSAGES } from "./product-rules";

/** ที่อยู่รูปที่ส่งขึ้นมา เปิดดูได้ที่ src/app/product-images/[key] */
export const IMAGE_URL_PREFIX = "/product-images/";

type ImageType = "image/jpeg" | "image/png";

const startsWith = (bytes: Uint8Array, signature: number[]) => signature.every((byte, i) => bytes[i] === byte);

/** ดูชนิดรูปจากไบต์ต้นไฟล์ ไม่เชื่อชื่อไฟล์หรือชนิดที่เบราว์เซอร์บอก */
function detectImageType(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  return null;
}

/** รูปที่ส่งขึ้นมาแต่ไม่มีที่ใดใช้ เก็บไว้เท่านี้ เผื่อหน้าฟอร์มที่ยังเปิดอยู่กดบันทึกทีหลัง (PRD-014) */
export const UNUSED_IMAGE_KEEP_MS = 24 * 60 * 60 * 1000;

/** ลบรูปของร้านที่เก่ากว่า UNUSED_IMAGE_KEEP_MS และไม่อยู่ในสินค้า คำสั่งซื้อ หรือตะกร้า */
function deleteUnusedImageFiles(db: Db, shopId: number, now: Date): void {
  db.prepare(
    `DELETE FROM product_image_files AS f WHERE f.shop_id = ? AND f.created_at < ?
       AND NOT EXISTS (SELECT 1 FROM product_images WHERE url = ? || f.key)
       AND NOT EXISTS (SELECT 1 FROM order_items WHERE cover_image_url = ? || f.key)
       AND NOT EXISTS (SELECT 1 FROM cart_items WHERE last_seen_image_url = ? || f.key)`,
  ).run(shopId, new Date(now.getTime() - UNUSED_IMAGE_KEEP_MS).toISOString(), IMAGE_URL_PREFIX, IMAGE_URL_PREFIX, IMAGE_URL_PREFIX);
}

/** เก็บรูปหนึ่งรูปของร้าน (PRD-003) คืนที่อยู่ของรูป หรือเหตุที่ไม่รับ ก่อนเก็บลบรูปเก่าที่ไม่มีที่ใช้ของร้านนั้น (PRD-014) */
export function saveImageFile(
  db: Db,
  shopId: number,
  bytes: Uint8Array,
  now: Date = new Date(),
): { ok: true; url: string } | { ok: false; error: string } {
  if (bytes.byteLength > LIMITS.imageBytes) return { ok: false, error: MESSAGES.imageTooLarge };
  const contentType = detectImageType(bytes);
  if (!contentType) return { ok: false, error: MESSAGES.imageWrongType };
  deleteUnusedImageFiles(db, shopId, now);
  const key = randomUUID();
  db.prepare("INSERT INTO product_image_files (key, shop_id, content_type, data, created_at) VALUES (?, ?, ?, ?, ?)").run(
    key,
    shopId,
    contentType,
    bytes,
    now.toISOString(),
  );
  return { ok: true, url: `${IMAGE_URL_PREFIX}${key}` };
}

export function getImageFile(db: Db, key: string): { contentType: ImageType; data: Uint8Array } | null {
  const row = db.prepare("SELECT content_type, data FROM product_image_files WHERE key = ?").get(key) as
    | { content_type: ImageType; data: Uint8Array }
    | undefined;
  return row ? { contentType: row.content_type, data: row.data } : null;
}

/** ที่อยู่นี้เป็นรูปที่ร้านนี้ส่งขึ้นมาเองหรือไม่ (PRD-012) */
export function isShopUpload(db: Db, shopId: number, url: string): boolean {
  if (!url.startsWith(IMAGE_URL_PREFIX)) return false;
  const key = url.slice(IMAGE_URL_PREFIX.length);
  return db.prepare("SELECT 1 FROM product_image_files WHERE key = ? AND shop_id = ?").get(key, shopId) !== undefined;
}
