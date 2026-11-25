import { randomUUID } from "node:crypto";
import type { Db } from "@/shared/db";
import { PRODUCT_STATUS } from "@/shared/statuses";
import { UNUSED_UPLOAD_KEEP_MS } from "./image-files";
import { MESSAGES, modelFileError } from "./product-rules";

/** ที่อยู่ไฟล์ 3 มิติที่ส่งขึ้นมา เปิดดูได้ที่ src/app/product-models/[key] */
export const MODEL_URL_PREFIX = "/product-models/";

const NAME_MAX = 255;

/**
 * ลบไฟล์ของร้านที่เก่ากว่า UNUSED_UPLOAD_KEEP_MS และไม่มีสินค้าใดใช้ เหมือนรูปที่ไม่ได้ใช้ (PRD-014)
 * สินค้าที่ลบแล้วไม่นับว่าใช้ เพราะไม่แสดงไฟล์นี้ที่ไหนอีก ต่างจากรูปที่ประวัติคำสั่งซื้อยังแสดง
 */
function deleteUnusedModelFiles(db: Db, shopId: number, now: Date): void {
  db.prepare(
    `DELETE FROM product_model_files AS f WHERE f.shop_id = ? AND f.created_at < ?
       AND NOT EXISTS (SELECT 1 FROM products WHERE model_url = ? || f.key AND status != ?)`,
  ).run(shopId, new Date(now.getTime() - UNUSED_UPLOAD_KEEP_MS).toISOString(), MODEL_URL_PREFIX, PRODUCT_STATUS.deleted);
}

/** เก็บไฟล์ 3 มิติหนึ่งไฟล์ของร้าน (P3D-001) คืนที่อยู่ไฟล์ หรือเหตุที่ไม่รับ */
export function saveModelFile(
  db: Db,
  shopId: number,
  name: string,
  bytes: Uint8Array,
  now: Date = new Date(),
): { ok: true; url: string } | { ok: false; error: string } {
  const fileName = name.trim();
  if (!fileName || fileName.length > NAME_MAX) return { ok: false, error: MESSAGES.modelUploadFailed };
  const error = modelFileError(bytes, bytes.byteLength);
  if (error) return { ok: false, error };
  deleteUnusedModelFiles(db, shopId, now);
  const key = randomUUID();
  db.prepare("INSERT INTO product_model_files (key, shop_id, name, data, created_at) VALUES (?, ?, ?, ?, ?)").run(
    key,
    shopId,
    fileName,
    bytes,
    now.toISOString(),
  );
  return { ok: true, url: `${MODEL_URL_PREFIX}${key}` };
}

export function getModelFile(db: Db, key: string): { data: Uint8Array } | null {
  const row = db.prepare("SELECT data FROM product_model_files WHERE key = ?").get(key) as { data: Uint8Array } | undefined;
  return row ? { data: row.data } : null;
}

const keyOf = (url: string) => (url.startsWith(MODEL_URL_PREFIX) ? url.slice(MODEL_URL_PREFIX.length) : null);

/** ชื่อและขนาดของไฟล์ที่ที่อยู่นี้ ให้หน้าฟอร์มแสดง (P3D-001) */
export function modelFileInfo(db: Db, url: string): { name: string; size: number } | null {
  const row = db.prepare("SELECT name, length(data) AS size FROM product_model_files WHERE key = ?").get(keyOf(url)) as
    | { name: string; size: number }
    | undefined;
  return row ? { name: row.name, size: row.size } : null;
}

/** ที่อยู่นี้เป็นไฟล์ที่ร้านนี้ส่งขึ้นมาเองหรือไม่ (PRD-012) */
export function isShopModelUpload(db: Db, shopId: number, url: string): boolean {
  return db.prepare("SELECT 1 FROM product_model_files WHERE key = ? AND shop_id = ?").get(keyOf(url), shopId) !== undefined;
}
