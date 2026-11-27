import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OwnReview } from "@/features/review/components/own-review";
import { MESSAGES } from "@/features/review/rules";
import { getReviewTarget } from "@/features/review/server/reviews";
import { getDb } from "@/shared/db";
import { requireAccount } from "@/shared/session";
import { EmptyState } from "@/shared/ui/states";
import { PageReveal } from "@/shared/ui/transitions";

export const metadata: Metadata = { title: "รีวิวสินค้า" };

export default async function ReviewPage({ params, searchParams }: PageProps<"/orders/[orderNo]/review/[itemId]">) {
  const { orderNo, itemId } = await params;
  const { edit, notice } = await searchParams;
  const orderPath = `/orders/${encodeURIComponent(orderNo)}`;
  const viewer = await requireAccount(`${orderPath}/review/${encodeURIComponent(itemId)}`);
  const target = getReviewTarget(getDb(), viewer.id, orderNo, /^\d+$/.test(itemId) ? Number(itemId) : NaN);
  if (target.state === "notFound") notFound();
  if (target.state === "notCompleted") {
    return (
      <PageReveal>
        <EmptyState level={1} title={MESSAGES.notCompleted}>
          <Link href={orderPath} className="button">
            กลับไปคำสั่งซื้อ
          </Link>
        </EmptyState>
      </PageReveal>
    );
  }
  return (
    <PageReveal>
      <OwnReview target={target} editing={edit === "1"} notice={notice} />
    </PageReveal>
  );
}
