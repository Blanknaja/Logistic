import Link from "next/link";
import { saveReviewAction } from "@/features/review/actions";
import { reviewHref } from "@/features/review/paths";
import { MESSAGES } from "@/features/review/rules";
import type { ReviewTarget } from "@/features/review/server/reviews";
import { formatThaiDateTime } from "@/shared/format";
import { ReviewForm } from "./review-form";
import { ReviewItem } from "./review-item";
import styles from "./review.module.css";

const NOTICES: Record<string, string> = { sent: MESSAGES.sent, saved: MESSAGES.saved, reviewed: MESSAGES.alreadyReviewed };

/**
 * หน้าเขียนรีวิวของรายการในคำสั่งซื้อหนึ่งรายการ ยังไม่มีรีวิวแสดงฟอร์ม มีแล้วแสดงรีวิวของตัวเองแทน (REV-001)
 * รีวิวที่ยังแก้ได้มีปุ่ม "แก้ไขรีวิว" (REV-004) รีวิวที่ถูกซ่อนแสดงป้ายกับเหตุผล (REV-017)
 */
export function OwnReview({
  target,
  editing,
  notice,
}: {
  target: Extract<ReviewTarget, { state: "open" }>;
  editing: boolean;
  notice?: unknown;
}) {
  const { item, review } = target;
  const here = reviewHref(item.orderNo, item.id);
  const message = typeof notice === "string" && Object.hasOwn(NOTICES, notice) ? NOTICES[notice] : null;

  return (
    <article className={styles.section}>
      <h1>{review === null ? "เขียนรีวิว" : editing && review.canEdit ? "แก้ไขรีวิว" : "รีวิวของฉัน"}</h1>
      <div className={styles.item}>
        {item.coverImageUrl ? <img src={item.coverImageUrl} alt="" /> : <span />}
        <div>
          <p>
            <Link href={`/products/${item.productId}`}>{item.productName}</Link>
          </p>
          {item.variantLabel && <p className={styles.muted}>{item.variantLabel}</p>}
        </div>
      </div>

      {review === null || (editing && review.canEdit) ? (
        <ReviewForm
          action={saveReviewAction}
          orderNo={item.orderNo}
          itemId={item.id}
          editing={review !== null}
          initial={review ?? { rating: 0, body: "", images: [] }}
          cancelHref={here}
        />
      ) : (
        <>
          {message && (
            <p role="status" className={styles.notice}>
              {message}
            </p>
          )}
          <ul className={styles.list}>
            <ReviewItem review={review} />
          </ul>
          {review.canEdit && (
            <div className={styles.actions}>
              <Link href={`${here}?edit=1`} className="button button-secondary">
                แก้ไขรีวิว
              </Link>
              <span className={styles.muted}>
                แก้ไขได้ถึง <time dateTime={review.editableUntil}>{formatThaiDateTime(review.editableUntil)}</time>
              </span>
            </div>
          )}
        </>
      )}

      <Link href={`/orders/${encodeURIComponent(item.orderNo)}`} className="link-action">
        กลับไปคำสั่งซื้อ
      </Link>
    </article>
  );
}
