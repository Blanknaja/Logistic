"use server";

import { refresh } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { reviewHref } from "@/features/review/paths";
import { MESSAGES } from "@/features/review/rules";
import { editReview, hideReview, replyToReview, submitReview, unhideReview, type Outcome, type ReviewErrors } from "@/features/review/server/reviews";
import { requireShopInAction } from "@/features/shop/require-shop";
import { getDb } from "@/shared/db";
import { getCurrentAccount, requireAccount } from "@/shared/session";

export type ReviewFormState = { errors: ReviewErrors };
export type ModerationState = { error: string | null };

/** ผู้ซื้อส่งรีวิวใหม่หรือบันทึกรีวิวที่แก้ สำเร็จแล้วกลับไปหน้าเดิมที่แสดงรีวิวของตัวเอง (REV-001 REV-004) */
export async function saveReviewAction(formData: FormData): Promise<ReviewFormState> {
  const path = reviewHref(String(formData.get("orderNo") ?? ""), Number(formData.get("itemId")));
  const viewer = await requireAccount(path);
  const editing = formData.get("mode") === "edit";
  const input = {
    buyerAccountId: viewer.id,
    orderItemId: Number(formData.get("itemId")),
    rating: Number(formData.get("rating")),
    body: String(formData.get("body") ?? ""),
    images: formData.getAll("image").map(String),
  };
  const result = editing ? editReview(getDb(), input) : submitReview(getDb(), input);
  if (result.ok) redirect(`${path}?notice=${editing ? "saved" : "sent"}`);
  // หน้าต่างที่เปิดค้างไว้ส่งซ้ำ ให้เห็นรีวิวเดิมพร้อมข้อความ (REV-003)
  if (result.errors.form === MESSAGES.alreadyReviewed) redirect(`${path}?notice=reviewed`);
  return result;
}

/** รีวิวเปลี่ยนไปแล้วระหว่างที่หน้าเปิดค้าง จึงโหลดหน้าใหม่ให้เห็นของจริงทั้งตอนสำเร็จและตอนถูกปฏิเสธ */
function moderationState(outcome: Outcome): ModerationState {
  if (outcome.ok) {
    refresh();
    return { error: null };
  }
  if ("notFound" in outcome) notFound();
  refresh();
  return { error: outcome.error };
}

/** ร้านตอบรีวิวหรือแก้คำตอบ รีวิวของร้านอื่นได้หน้า "ไม่พบหน้านี้" (REV-015) */
export async function replyAction(formData: FormData): Promise<ModerationState> {
  const viewer = await requireShopInAction("/seller/reviews");
  return moderationState(
    replyToReview(getDb(), {
      shopId: viewer.shopId,
      reviewId: Number(formData.get("reviewId")),
      body: String(formData.get("body") ?? ""),
      editing: formData.get("editing") === "1",
    }),
  );
}

async function requireAdmin() {
  const viewer = await getCurrentAccount();
  if (!viewer?.isAdmin) notFound();
  return viewer;
}

/** ผู้ดูแลแพลตฟอร์มซ่อนรีวิวพร้อมเหตุผล (REV-016) */
export async function hideReviewAction(formData: FormData): Promise<ModerationState> {
  const viewer = await requireAdmin();
  return moderationState(
    hideReview(getDb(), { adminAccountId: viewer.id, reviewId: Number(formData.get("reviewId")), reason: String(formData.get("reason") ?? "") }),
  );
}

/** ผู้ดูแลแพลตฟอร์มเลิกซ่อนรีวิว (REV-016) */
export async function unhideReviewAction(formData: FormData): Promise<ModerationState> {
  const viewer = await requireAdmin();
  return moderationState(unhideReview(getDb(), { adminAccountId: viewer.id, reviewId: Number(formData.get("reviewId")) }));
}
