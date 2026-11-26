import { randomUUID } from "node:crypto";
import { LIMITS, MESSAGES } from "@/features/review/rules";
import type { Db } from "@/shared/db";
import { detectImageType, type ImageType } from "@/shared/rules";
import { REVIEW_STATUS } from "@/shared/statuses";

/** ที่อยู่รูปในรีวิวที่ผู้ซื้อส่งขึ้นมา เปิดดูได้ที่ src/app/review-images/[key] */
export const REVIEW_IMAGE_URL_PREFIX = "/review-images/";

/** รูปที่ส่งขึ้นมาแต่ไม่มีรีวิวใช้ เก็บไว้เท่านี้ เผื่อหน้าเขียนรีวิวที่ยังเปิดอยู่กดส่งทีหลัง */
export const UNUSED_UPLOAD_KEEP_MS = 24 * 60 * 60 * 1000;

/** บัญชีหนึ่งมีรูปที่ไม่มีรีวิวใช้ได้เท่านี้ คือรูปของฟอร์มรีวิวสองฟอร์ม */
export const UNUSED_UPLOAD_LIMIT = 2 * LIMITS.images;

const UNUSED = "NOT EXISTS (SELECT 1 FROM review_images WHERE url = ? || f.key)";

function deleteUnusedImageFiles(db: Db, accountId: number, now: Date): void {
  db.prepare(`DELETE FROM review_image_files AS f WHERE f.account_id = ? AND f.created_at < ? AND ${UNUSED}`).run(
    accountId,
    new Date(now.getTime() - UNUSED_UPLOAD_KEEP_MS).toISOString(),
    REVIEW_IMAGE_URL_PREFIX,
  );
}

const countUnusedImageFiles = (db: Db, accountId: number) =>
  Number(
    db.prepare(`SELECT count(*) AS n FROM review_image_files AS f WHERE f.account_id = ? AND ${UNUSED}`).get(accountId, REVIEW_IMAGE_URL_PREFIX)?.n,
  );

/**
 * เก็บรูปหนึ่งรูปของบัญชี (REV-002) คืนที่อยู่ของรูป หรือเหตุที่ไม่รับ
 * ก่อนเก็บลบรูปเก่าที่ไม่มีรีวิวใช้ของบัญชีนั้น แล้วไม่รับเพิ่มถ้ารูปที่ไม่มีรีวิวใช้ยังครบ UNUSED_UPLOAD_LIMIT
 */
export function saveReviewImage(
  db: Db,
  accountId: number,
  bytes: Uint8Array,
  now: Date = new Date(),
): { ok: true; url: string } | { ok: false; error: string } {
  if (bytes.byteLength > LIMITS.imageBytes) return { ok: false, error: MESSAGES.imageTooLarge };
  const contentType = detectImageType(bytes);
  if (!contentType) return { ok: false, error: MESSAGES.imageWrongType };
  deleteUnusedImageFiles(db, accountId, now);
  if (countUnusedImageFiles(db, accountId) >= UNUSED_UPLOAD_LIMIT) return { ok: false, error: MESSAGES.tooManyUnusedUploads };
  const key = randomUUID();
  db.prepare("INSERT INTO review_image_files (key, account_id, content_type, data, created_at) VALUES (?, ?, ?, ?, ?)").run(
    key,
    accountId,
    contentType,
    bytes,
    now.toISOString(),
  );
  return { ok: true, url: `${REVIEW_IMAGE_URL_PREFIX}${key}` };
}

export type ImageViewer = { id: number; shopId: number | null; isAdmin: boolean };

/**
 * รูปของรีวิวที่ `แสดงอยู่` เปิดได้ทุกคน รูปอื่นเปิดได้เฉพาะบัญชีที่ส่งรูป ผู้ดูแลแพลตฟอร์ม
 * และร้านของรีวิวที่ `ถูกซ่อน` ซึ่งใช้รูปนั้น (REV-017) viewer เป็น null คือถามแบบคนทั่วไป
 */
export function getReviewImage(db: Db, key: string, viewer: ImageViewer | null): { contentType: ImageType; data: Uint8Array } | null {
  const row = db
    .prepare(
      `SELECT f.content_type, f.data, f.account_id,
         EXISTS (SELECT 1 FROM review_images i JOIN reviews r ON r.id = i.review_id
                 WHERE i.url = ?1 || f.key AND r.status = ?2) AS shown,
         EXISTS (SELECT 1 FROM review_images i JOIN reviews r ON r.id = i.review_id
                 WHERE i.url = ?1 || f.key AND r.shop_id = ?3) AS of_shop
       FROM review_image_files f WHERE f.key = ?4`,
    )
    .get(REVIEW_IMAGE_URL_PREFIX, REVIEW_STATUS.visible, viewer?.shopId ?? null, key) as
    | { content_type: ImageType; data: Uint8Array; account_id: number; shown: number; of_shop: number }
    | undefined;
  if (!row) return null;
  const allowed = row.shown === 1 || (viewer !== null && (viewer.isAdmin || viewer.id === row.account_id || row.of_shop === 1));
  return allowed ? { contentType: row.content_type, data: row.data } : null;
}

/** ที่อยู่นี้เป็นรูปที่บัญชีนี้ส่งขึ้นมาเองหรือไม่ */
export function isOwnReviewImage(db: Db, accountId: number, url: string): boolean {
  if (!url.startsWith(REVIEW_IMAGE_URL_PREFIX)) return false;
  const key = url.slice(REVIEW_IMAGE_URL_PREFIX.length);
  return db.prepare("SELECT 1 FROM review_image_files WHERE key = ? AND account_id = ?").get(key, accountId) !== undefined;
}
