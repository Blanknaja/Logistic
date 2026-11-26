import { notifyNewReview, notifyReviewHidden, notifyReviewReplied } from "@/features/notification/server/events";
import { reviewHref, SELLER_REVIEWS_PATH } from "@/features/review/paths";
import type { Db } from "@/shared/db";

// แจ้งเตือนที่เกิดจากรีวิว (NTF-009 NTF-012) แต่ละฟังก์ชันถูกเรียกที่เดียวใน reviews.ts
// ภายในการบันทึกเดียวกับเหตุการณ์นั้น เหตุการณ์ที่ถูกปฏิเสธจึงไม่มีแจ้งเตือน

type ReviewFacts = {
  buyer_account_id: number;
  shop_id: number;
  rating: number;
  hidden_reason: string | null;
  product_name: string;
  order_item_id: number;
  order_no: string;
  shop_name: string;
};

function factsOf(db: Db, reviewId: number): ReviewFacts {
  return db
    .prepare(
      `SELECT r.buyer_account_id, r.shop_id, r.rating, r.hidden_reason, i.product_name, r.order_item_id, o.order_no, s.name AS shop_name
       FROM reviews r
       JOIN order_items i ON i.id = r.order_item_id
       JOIN orders o ON o.id = i.order_id
       JOIN shops s ON s.id = r.shop_id
       WHERE r.id = ?`,
    )
    .get(reviewId) as ReviewFacts;
}

/** ผู้ซื้อส่งรีวิวใหม่ ผู้ขายเจ้าของร้านได้แจ้งเตือนที่พาไปหน้ารีวิวของร้าน ซึ่งรีวิวล่าสุดอยู่บนสุด (NTF-012) */
export function onReviewPosted(db: Db, reviewId: number, now: Date): void {
  const review = factsOf(db, reviewId);
  notifyNewReview(
    db,
    { reviewId, shopId: review.shop_id, productName: review.product_name, rating: review.rating, href: SELLER_REVIEWS_PATH },
    now,
  );
}

/** ร้านตอบรีวิวครั้งแรก ผู้ซื้อเจ้าของรีวิวได้แจ้งเตือนที่พาไปหน้าเขียนรีวิวของรายการนั้น การแก้คำตอบไม่เรียก (NTF-009) */
export function onReviewReplied(db: Db, reviewId: number, now: Date): void {
  const review = factsOf(db, reviewId);
  notifyReviewReplied(
    db,
    {
      reviewId,
      buyerAccountId: review.buyer_account_id,
      shopName: review.shop_name,
      productName: review.product_name,
      href: reviewHref(review.order_no, review.order_item_id),
    },
    now,
  );
}

/** ผู้ดูแลแพลตฟอร์มซ่อนรีวิว ผู้ซื้อเจ้าของรีวิวได้แจ้งเตือนพร้อมเหตุผล (NTF-009) */
export function onReviewHidden(db: Db, reviewId: number, now: Date): void {
  const review = factsOf(db, reviewId);
  notifyReviewHidden(
    db,
    {
      reviewId,
      buyerAccountId: review.buyer_account_id,
      productName: review.product_name,
      reason: review.hidden_reason ?? "",
      href: reviewHref(review.order_no, review.order_item_id),
    },
    now,
  );
}
