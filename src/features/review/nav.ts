import { ADMIN_REVIEWS_PATH, SELLER_REVIEWS_PATH } from "@/features/review/paths";
import { countUnansweredReviews } from "@/features/review/server/reviews";
import { getDb } from "@/shared/db";
import { formatNumber } from "@/shared/format";
import type { FeatureNav } from "@/shared/nav/types";

/** "รีวิว ยังไม่ตอบ 3" เมื่อมีรีวิวที่ยังไม่ตอบ ไม่มีหรือนับไม่ได้ขึ้นแค่ "รีวิว" โดยเมนูส่วนอื่นยังใช้ได้ (REV-014) */
export function reviewsMenuLabel(shopId: number): string {
  try {
    const unanswered = countUnansweredReviews(getDb(), shopId);
    return unanswered > 0 ? `รีวิว ยังไม่ตอบ ${formatNumber(unanswered)}` : "รีวิว";
  } catch (error) {
    console.error(error);
    return "รีวิว";
  }
}

export const nav: FeatureNav = {
  // ADM ยังไม่มี ผู้ดูแลแพลตฟอร์มจึงเข้าหน้าจัดการรีวิวจากแถบด้านบน (REV-016)
  header: [{ label: "จัดการรีวิว", href: ADMIN_REVIEWS_PATH, order: 60, visibleTo: (viewer) => viewer?.isAdmin === true }],
  sellerMenu: [{ label: reviewsMenuLabel, href: SELLER_REVIEWS_PATH, order: 35 }],
};
