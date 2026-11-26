import Link from "next/link";
import { reviewHref } from "@/features/review/paths";
import { formatAverage, MESSAGES, type Rating } from "@/features/review/rules";
import { formatNumber } from "@/shared/format";
import styles from "./review.module.css";

// ตัวแสดงคะแนนที่หน้าอื่นเอาไปวางด้วยบรรทัดเดียว ใช้ได้ทั้งใน server component และ client component

/** "★ 4.3 (128)" บนการ์ดสินค้า สินค้าที่ไม่มีรีวิวที่ `แสดงอยู่` ไม่แสดงอะไรเลย (REV-009) */
export function CardRating({ rating }: { rating?: Rating | null }) {
  if (!rating) return null;
  const average = formatAverage(rating.average);
  const count = formatNumber(rating.count);
  return (
    <span className={styles.cardRating}>
      <span aria-hidden="true">
        ★ {average} ({count})
      </span>
      <span className="visually-hidden">
        คะแนน {average} จาก 5 จาก {count} รีวิว
      </span>
    </span>
  );
}

/** ดาว 5 ดวงของรีวิวหนึ่งรีวิว โปรแกรมอ่านจอได้ยิน "4 ดาว" */
export function Stars({ rating }: { rating: number }) {
  return (
    <span className={styles.stars}>
      <span aria-hidden="true">{"★".repeat(rating) + "☆".repeat(5 - rating)}</span>
      <span className="visually-hidden">{rating} ดาว</span>
    </span>
  );
}

/** "★ 4.3" กับ "3 รีวิว" ใกล้ชื่อสินค้า กดแล้วเลื่อนไปที่รายการรีวิว ไม่มีรีวิวไม่แสดงอะไร (REV-006) */
export function ProductRatingLink({ rating }: { rating: Rating | null }) {
  if (!rating) return null;
  return (
    <a href="#reviews" className={styles.ratingLink}>
      <span>
        <span aria-hidden="true">★ </span>
        <span className="visually-hidden">คะแนน </span>
        {formatAverage(rating.average)}
      </span>
      <span>{formatNumber(rating.count)} รีวิว</span>
    </a>
  );
}

/** คะแนนของร้านใกล้ชื่อร้าน "★ 3.6" กับ "5 รีวิว" หรือ "ยังไม่มีรีวิว" (REV-013) */
export function ShopRatingLine({ rating }: { rating: Rating | null }) {
  if (!rating) return <p className={`${styles.shopRating} ${styles.muted}`}>{MESSAGES.noReviews}</p>;
  return (
    <p className={styles.shopRating}>
      <span>
        <span aria-hidden="true">★ </span>
        <span className="visually-hidden">คะแนน </span>
        {formatAverage(rating.average)}
      </span>
      <span>{formatNumber(rating.count)} รีวิว</span>
    </p>
  );
}

/** ป้าย "รอรีวิว 2 รายการ" ของคำสั่งซื้อในหน้ารายการคำสั่งซื้อ ไม่มีรายการรอรีวิวไม่แสดง (REV-005) */
export function AwaitingReviewBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span className={styles.orderBadge}>รอรีวิว {formatNumber(count)} รายการ</span>;
}

/** ของรายการในคำสั่งซื้อที่ `สำเร็จ`: ปุ่ม "เขียนรีวิว" หรือคะแนนที่ให้กับลิงก์ "ดูรีวิวของฉัน" (REV-005) */
export function OrderItemReview({ orderNo, itemId, rating }: { orderNo: string; itemId: number; rating: number | null }) {
  return (
    <div className={styles.orderItemReview}>
      {rating === null ? (
        <Link href={reviewHref(orderNo, itemId)} className="button button-secondary">
          เขียนรีวิว
        </Link>
      ) : (
        <>
          <span>{rating} ดาว</span>
          <Link href={reviewHref(orderNo, itemId)} className="link-action">
            ดูรีวิวของฉัน
          </Link>
        </>
      )}
    </div>
  );
}
