"use client";

import { catchError, type ErrorInfo } from "next/error";
import { MESSAGES } from "@/features/review/rules";
import { RetryButton } from "@/shared/ui/retry-button";
import { ErrorState } from "@/shared/ui/states";

/** "โหลดรีวิวไม่สำเร็จ" พร้อมปุ่ม "ลองใหม่" ไม่ส่ง onRetry ปุ่มจะโหลดข้อมูลของหน้าเดิมใหม่ (REV-018) */
export function ReviewsFailed({ onRetry }: { onRetry?: () => void }) {
  return <ErrorState level={2} title={MESSAGES.loadFailed} action={<RetryButton onRetry={onRetry} secondary />} />;
}

/** ส่วนรีวิวที่โหลดไม่สำเร็จแสดงข้อความในที่ของตัวเอง ส่วนอื่นของหน้ายังใช้ได้ (REV-018) */
export const ReviewsBoundary = catchError(function ReviewsFallback(_props: object, { retry }: ErrorInfo) {
  return <ReviewsFailed onRetry={retry} />;
});
