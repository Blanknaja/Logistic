import { randomUUID } from "node:crypto";
import { LIMITS, MESSAGES } from "@/features/review/rules";
import type { Db } from "@/shared/db";
import { detectImageType, type ImageType } from "@/shared/rules";

/** ที่อยู่รูปในรีวิวที่ผู้ซื้อส่งขึ้นมา เปิดดูได้ที่ src/app/review-images/[key] */
export const REVIEW_IMAGE_URL_PREFIX = "/review-images/";

/** รูปที่ส่งขึ้นมาแต่ไม่มีรีวิวใช้ เก็บไว้เท่านี้ เผื่อหน้าเขียนรีวิวที่ยังเปิดอยู่กดส่งทีหลัง */
export const UNUSED_UPLOAD_KEEP_MS = 24 * 60 * 60 * 1000;

function deleteUnusedImageFiles(db: Db, accountId: number, now: Date): void {
  db.prepare(
    `DELETE FROM review_image_files AS f WHERE f.account_id = ? AND f.created_at < ?
       AND NOT EXISTS (SELECT 1 FROM review_images WHERE url = ? || f.key)`,
  ).run(accountId, new Date(now.getTime() - UNUSED_UPLOAD_KEEP_MS).toISOString(), REVIEW_IMAGE_URL_PREFIX);
}

/** เก็บรูปหนึ่งรูปของบัญชี (REV-002) คืนที่อยู่ของรูป หรือเหตุที่ไม่รับ ก่อนเก็บลบรูปเก่าที่ไม่มีรีวิวใช้ของบัญชีนั้น */
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

export function getReviewImage(db: Db, key: string): { contentType: ImageType; data: Uint8Array } | null {
  const row = db.prepare("SELECT content_type, data FROM review_image_files WHERE key = ?").get(key) as
    | { content_type: ImageType; data: Uint8Array }
    | undefined;
  return row ? { contentType: row.content_type, data: row.data } : null;
}

/** ที่อยู่นี้เป็นรูปที่บัญชีนี้ส่งขึ้นมาเองหรือไม่ */
export function isOwnReviewImage(db: Db, accountId: number, url: string): boolean {
  if (!url.startsWith(REVIEW_IMAGE_URL_PREFIX)) return false;
  const key = url.slice(REVIEW_IMAGE_URL_PREFIX.length);
  return db.prepare("SELECT 1 FROM review_image_files WHERE key = ? AND account_id = ?").get(key, accountId) !== undefined;
}
