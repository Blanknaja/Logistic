import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hideReviewAction, unhideReviewAction } from "@/features/review/actions";
import { HideForm, UnhideForm } from "@/features/review/components/moderation-forms";
import { ReviewFilters, ReviewItem, ReviewPager } from "@/features/review/components/review-item";
import styles from "@/features/review/components/review.module.css";
import { ADMIN_REVIEWS_PATH } from "@/features/review/paths";
import { listAllReviews } from "@/features/review/server/reviews";
import { getDb } from "@/shared/db";
import { requireAccount } from "@/shared/session";
import { REVIEW_STATUS, type ReviewStatus } from "@/shared/statuses";
import { EmptyState } from "@/shared/ui/states";
import { PageReveal } from "@/shared/ui/transitions";

export const metadata: Metadata = { title: "จัดการรีวิว" };

const STATUS_BY_PARAM: Record<string, ReviewStatus> = { visible: REVIEW_STATUS.visible, hidden: REVIEW_STATUS.hidden };

const href = (status: string | null, page = 1) => {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (page > 1) params.set("page", String(page));
  const text = params.toString();
  return text ? `${ADMIN_REVIEWS_PATH}?${text}` : ADMIN_REVIEWS_PATH;
};

/** รีวิวของทุกร้านสำหรับผู้ดูแลแพลตฟอร์ม ซ่อนพร้อมเหตุผลและเลิกซ่อนได้ บัญชีอื่นได้หน้า "ไม่พบหน้านี้" (REV-016) */
export default async function AdminReviewsPage({ searchParams }: PageProps<"/admin/reviews">) {
  const query = await searchParams;
  const param = typeof query.status === "string" && Object.hasOwn(STATUS_BY_PARAM, query.status) ? query.status : null;
  const viewer = await requireAccount(href(param));
  if (!viewer.isAdmin) notFound();
  const list = listAllReviews(getDb(), { status: param ? STATUS_BY_PARAM[param] : null, page: Number(query.page) });

  return (
    <PageReveal>
      <section className={styles.section}>
        <h1>จัดการรีวิว</h1>
        <ReviewFilters
          label="กรองตามสถานะ"
          filters={[
            { label: "ทั้งหมด", count: list.counts.all, href: href(null), active: param === null },
            { label: REVIEW_STATUS.visible, count: list.counts.visible, href: href("visible"), active: param === "visible" },
            { label: REVIEW_STATUS.hidden, count: list.counts.hidden, href: href("hidden"), active: param === "hidden" },
          ]}
        />
        {list.reviews.length === 0 ? (
          <EmptyState title="ไม่มีรีวิวในสถานะนี้" />
        ) : (
          <>
            <ul className={`card ${styles.list}`}>
              {list.reviews.map((review) => (
                <ReviewItem key={review.id} review={review} meta={`${review.productName} · ${review.shopName} · ${review.status}`}>
                  {review.status === REVIEW_STATUS.visible ? (
                    <HideForm action={hideReviewAction} reviewId={review.id} />
                  ) : (
                    <UnhideForm action={unhideReviewAction} reviewId={review.id} />
                  )}
                </ReviewItem>
              ))}
            </ul>
            <ReviewPager page={list.page} totalPages={list.totalPages} href={(page) => href(param, page)} />
          </>
        )}
      </section>
    </PageReveal>
  );
}
