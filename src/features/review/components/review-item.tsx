import Link from "next/link";
import type { ReactNode } from "react";
import { MESSAGES } from "@/features/review/rules";
import type { ListedReview } from "@/features/review/server/reviews";
import { formatNumber, formatThaiDate, formatThaiDateTime } from "@/shared/format";
import { Stars } from "./rating";
import styles from "./review.module.css";

type Shown = Pick<ListedReview, "rating" | "body" | "images" | "createdAt" | "edited" | "reply"> &
  Partial<Pick<ListedReview, "id" | "author" | "variantLabel" | "hiddenReason" | "hiddenAt">>;

/** รีวิวหนึ่งรีวิว: ชื่อ คะแนน วันที่ แบบย่อย ข้อความ รูป และคำตอบของร้าน (REV-007) meta กับ children คือส่วนที่แต่ละหน้าเพิ่มเอง */
export function ReviewItem({ review, meta, children }: { review: Shown; meta?: ReactNode; children?: ReactNode }) {
  return (
    <li className={styles.review} id={review.id ? `review-${review.id}` : undefined}>
      <div className={styles.head}>
        {review.author && <span>{review.author}</span>}
        <Stars rating={review.rating} />
        <time dateTime={review.createdAt} className={styles.muted}>
          {formatThaiDate(review.createdAt)}
        </time>
        {review.edited && <span className={styles.muted}>แก้ไขแล้ว</span>}
      </div>
      {meta && <p className={styles.muted}>{meta}</p>}
      {review.variantLabel && <p className={styles.muted}>{review.variantLabel}</p>}
      {review.hiddenReason != null && (
        <p className={styles.badge}>
          {MESSAGES.hiddenBadge} เหตุผล: {review.hiddenReason}
          {review.hiddenAt && (
            <>
              {" "}
              <time dateTime={review.hiddenAt}>{formatThaiDateTime(review.hiddenAt)}</time>
            </>
          )}
        </p>
      )}
      {review.body && <p className={styles.body}>{review.body}</p>}
      {review.images.length > 0 && (
        <ul className={styles.images}>
          {review.images.map((url, index) => (
            <li key={url}>
              <a href={url} target="_blank" rel="noreferrer" aria-label={`ดูรูปที่ ${index + 1} ขนาดใหญ่`}>
                <img src={url} alt={`รูปในรีวิว รูปที่ ${index + 1}`} loading="lazy" />
              </a>
            </li>
          ))}
        </ul>
      )}
      {review.reply && (
        <div className={styles.reply}>
          <p>คำตอบจากร้าน: {review.reply.body}</p>
          <p className={styles.muted}>
            <time dateTime={review.reply.repliedAt}>{formatThaiDate(review.reply.repliedAt)}</time>
            {review.reply.edited && " แก้ไขแล้ว"}
          </p>
        </div>
      )}
      {children}
    </li>
  );
}

/** เลขหน้าพร้อมปุ่มหน้าก่อนหน้าและหน้าถัดไป ปุ่มที่ไปต่อไม่ได้กดไม่ได้ มีหน้าเดียวไม่แสดง (REV-007) */
export function ReviewPager({ page, totalPages, href }: { page: number; totalPages: number; href: (page: number) => string }) {
  if (totalPages <= 1) return null;
  const link = (target: number, label: string) =>
    target >= 1 && target <= totalPages ? (
      <Link href={href(target)} className="button button-secondary">
        {label}
      </Link>
    ) : (
      <button type="button" className="button button-secondary" disabled>
        {label}
      </button>
    );
  return (
    <nav aria-label="เปลี่ยนหน้ารีวิว" className={styles.pager}>
      {link(page - 1, "หน้าก่อนหน้า")}
      <span>
        หน้า {formatNumber(page)} จาก {formatNumber(totalPages)}
      </span>
      {link(page + 1, "หน้าถัดไป")}
    </nav>
  );
}

/** ตัวกรองเป็นแถว chip แต่ละตัวมีจำนวนกำกับ (REV-008 REV-014 REV-016) */
export function ReviewFilters({
  label,
  filters,
}: {
  label: string;
  filters: { label: string; count: number; href: string; active: boolean }[];
}) {
  return (
    <nav aria-label={label}>
      <ul className={`chips ${styles.filters}`}>
        {filters.map((filter) => (
          <li key={filter.label}>
            <Link href={filter.href} className={`chip ${styles.chipLink}`} aria-current={filter.active ? "page" : undefined}>
              {filter.label} {formatNumber(filter.count)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
