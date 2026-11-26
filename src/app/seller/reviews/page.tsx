import type { Metadata } from "next";
import { replyAction } from "@/features/review/actions";
import { ReplyForm } from "@/features/review/components/moderation-forms";
import { ShopRatingLine } from "@/features/review/components/rating";
import { ReviewFilters, ReviewItem, ReviewPager } from "@/features/review/components/review-item";
import styles from "@/features/review/components/review.module.css";
import { SELLER_REVIEWS_PATH } from "@/features/review/paths";
import { shopRating } from "@/features/review/server/ratings";
import { listShopReviews } from "@/features/review/server/reviews";
import { requireShop } from "@/features/shop/require-shop";
import { getDb } from "@/shared/db";
import { REVIEW_STATUS } from "@/shared/statuses";
import { EmptyState } from "@/shared/ui/states";

export const metadata: Metadata = { title: "รีวิวของร้าน" };

const href = (unanswered: boolean, page = 1) => {
  const params = new URLSearchParams();
  if (unanswered) params.set("filter", "unanswered");
  if (page > 1) params.set("page", String(page));
  const text = params.toString();
  return text ? `${SELLER_REVIEWS_PATH}?${text}` : SELLER_REVIEWS_PATH;
};

/** รีวิวของสินค้าในร้านตัวเอง ล่าสุดก่อน พร้อมตัวกรอง "ยังไม่ตอบ" และช่องตอบรีวิว (REV-014 REV-015) */
export default async function SellerReviewsPage({ searchParams }: PageProps<"/seller/reviews">) {
  const query = await searchParams;
  const unanswered = query.filter === "unanswered";
  const viewer = await requireShop(href(unanswered));
  const db = getDb();
  const list = listShopReviews(db, viewer.shopId, { unanswered, page: Number(query.page) });

  return (
    <section className={styles.section}>
      <h1>รีวิวของร้าน</h1>
      <ShopRatingLine rating={shopRating(db, viewer.shopId)} />
      <ReviewFilters
        label="กรองรีวิว"
        filters={[
          { label: "ทั้งหมด", count: list.counts.all, href: href(false), active: !unanswered },
          { label: "ยังไม่ตอบ", count: list.counts.unanswered, href: href(true), active: unanswered },
        ]}
      />
      {list.reviews.length === 0 ? (
        <EmptyState title={list.counts.all === 0 ? "ร้านของคุณยังไม่มีรีวิว" : "ตอบครบทุกรีวิวแล้ว"} />
      ) : (
        <>
          <ul className={styles.list}>
            {list.reviews.map((review) => (
              <ReviewItem key={review.id} review={review} meta={`${review.productName} · คำสั่งซื้อ ${review.orderNo}`}>
                {review.status === REVIEW_STATUS.visible && (
                  <ReplyForm action={replyAction} reviewId={review.id} reply={review.reply?.body ?? null} />
                )}
              </ReviewItem>
            ))}
          </ul>
          <ReviewPager page={list.page} totalPages={list.totalPages} href={(page) => href(unanswered, page)} />
        </>
      )}
    </section>
  );
}
