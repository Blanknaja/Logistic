import type { Db } from "@/shared/db";
import { REVIEW_STATUS } from "@/shared/statuses";

/**
 * เขียนรีวิวลงฐานข้อมูลตรงๆ สำหรับ test เท่านั้น ข้ามกฎของการส่งรีวิว เช่นสถานะคำสั่งซื้อ
 * ผู้ซื้อ สินค้า และร้านมาจากรายการในคำสั่งซื้อ
 */
export function writeReview(
  db: Db,
  input: {
    orderItemId: number;
    rating: number;
    body?: string;
    createdAt?: string;
    images?: string[];
    reply?: { body: string; at?: string };
    hidden?: { reason: string; at?: string; byAccountId?: number };
  },
): { id: number } {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const inserted = db
    .prepare(
      `INSERT INTO reviews (order_item_id, buyer_account_id, product_id, shop_id, rating, body, status, created_at,
         reply_body, replied_at, hidden_reason, hidden_at, hidden_by_account_id)
       SELECT i.id, o.buyer_account_id, i.product_id, o.shop_id, ?, ?, ?, ?, ?, ?, ?, ?, ?
       FROM order_items i JOIN orders o ON o.id = i.order_id WHERE i.id = ?`,
    )
    .run(
      input.rating,
      input.body ?? "",
      input.hidden ? REVIEW_STATUS.hidden : REVIEW_STATUS.visible,
      createdAt,
      input.reply?.body ?? null,
      input.reply ? (input.reply.at ?? createdAt) : null,
      input.hidden?.reason ?? null,
      input.hidden ? (input.hidden.at ?? createdAt) : null,
      input.hidden?.byAccountId ?? null,
      input.orderItemId,
    );
  if (inserted.changes === 0) throw new Error(`ไม่มีรายการในคำสั่งซื้อ ${input.orderItemId}`);
  const id = Number(inserted.lastInsertRowid);
  (input.images ?? []).forEach((url, position) => {
    db.prepare("INSERT INTO review_images (review_id, url, position) VALUES (?, ?, ?)").run(id, url, position);
  });
  return { id };
}
