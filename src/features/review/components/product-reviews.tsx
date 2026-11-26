import { Suspense } from "react";
import { formatAverage, MESSAGES, parseStars } from "@/features/review/rules";
import { productRating, type Stars } from "@/features/review/server/ratings";
import { listProductReviews } from "@/features/review/server/reviews";
import { getDb } from "@/shared/db";
import { formatNumber } from "@/shared/format";
import { LoadingTimeout } from "@/shared/ui/loading-timeout";
import { LoadingState } from "@/shared/ui/states";
import { ProductRatingLink } from "./rating";
import { ReviewFilters, ReviewItem, ReviewPager } from "./review-item";
import { ReviewsBoundary, ReviewsFailed } from "./reviews-boundary";
import styles from "./review.module.css";

type Query = { stars?: string | string[]; rpage?: string | string[] };

const STARS: Stars[] = [5, 4, 3, 2, 1];

/** คะแนนเฉลี่ยกับจำนวนรีวิวใกล้ชื่อสินค้า (REV-006) */
export function ProductRating({ productId }: { productId: number }) {
  return <ProductRatingLink rating={productRating(getDb(), productId)} />;
}

/**
 * ส่วนรีวิวของหน้ารายละเอียดสินค้า: สรุปคะแนน ตัวกรองตามดาว และรายการรีวิวหน้าละ 10 (REV-006 ถึง REV-008)
 * โหลดไม่สำเร็จหรือเกิน 10 วินาที แสดงข้อความในส่วนนี้เอง ส่วนอื่นของหน้ายังใช้ได้ (REV-018)
 */
export function ProductReviews({ productId, query }: { productId: number; query: Query }) {
  return (
    <section id="reviews" className={styles.section} aria-labelledby="reviews-title">
      <h2 id="reviews-title">รีวิว</h2>
      <ReviewsBoundary>
        <Suspense
          fallback={
            <LoadingTimeout failed={<ReviewsFailed />}>
              <LoadingState level={2} title="กำลังโหลดรีวิว" />
            </LoadingTimeout>
          }
        >
          <ReviewList productId={productId} query={query} />
        </Suspense>
      </ReviewsBoundary>
    </section>
  );
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export function ReviewList({ productId, query }: { productId: number; query: Query }) {
  const db = getDb();
  const rating = productRating(db, productId);
  if (!rating) return <p>{MESSAGES.noReviews}</p>;

  const stars = parseStars(first(query.stars));
  const list = listProductReviews(db, productId, { stars, page: Number(first(query.rpage)) });
  const href = (starFilter: number | null, page = 1) => {
    const params = new URLSearchParams();
    if (starFilter) params.set("stars", String(starFilter));
    if (page > 1) params.set("rpage", String(page));
    const text = params.toString();
    return `/products/${productId}${text ? `?${text}` : ""}#reviews`;
  };

  return (
    <>
      <div className={`card ${styles.summary}`}>
        <p className={styles.average}>
          <i aria-hidden="true" className={styles.stars}>
            <span className={styles.starOn}>{"★".repeat(Math.round(rating.average))}</span>
            <span className={styles.starOff}>{"★".repeat(5 - Math.round(rating.average))}</span>
          </i>
          <span className={styles.averageNumber}>{formatAverage(rating.average)}</span>
          <span className="visually-hidden">จาก 5 ดาว</span>
          <span>{formatNumber(rating.count)} รีวิว</span>
        </p>
        <ul className={styles.breakdown} aria-label="จำนวนรีวิวของแต่ละดาว">
          {STARS.map((star) => (
            <li key={star}>
              <span>{star} ดาว</span>
              <progress max={rating.count} value={rating.stars[star]} aria-hidden="true" />
              <span>{formatNumber(rating.stars[star])}</span>
            </li>
          ))}
        </ul>
      </div>
      <ReviewFilters
        label="กรองรีวิวตามจำนวนดาว"
        filters={[
          { label: "ทั้งหมด", count: rating.count, href: href(null), active: stars === null },
          ...STARS.map((star) => ({ label: `${star} ดาว`, count: rating.stars[star], href: href(star), active: stars === star })),
        ]}
      />
      {list.reviews.length === 0 ? (
        <p>ยังไม่มีรีวิว {stars} ดาว</p>
      ) : (
        <>
          <ul className={`card ${styles.list}`}>
            {list.reviews.map((review) => (
              <ReviewItem key={review.id} review={review} />
            ))}
          </ul>
          <ReviewPager page={list.page} totalPages={list.totalPages} href={(page) => href(stars, page)} />
        </>
      )}
    </>
  );
}
