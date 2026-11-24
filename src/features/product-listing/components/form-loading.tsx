"use client";

import Link from "next/link";
import { LoadingTimeout } from "@/shared/ui/loading-timeout";
import { RetryButton } from "@/shared/ui/retry-button";
import { ErrorState, LoadingState } from "@/shared/ui/states";

export const FORM_LOAD_FAILED = "โหลดข้อมูลสินค้าไม่ได้ ลองใหม่อีกครั้ง";

/** โหลดข้อมูลสินค้ามาแก้ไม่ได้ ไม่มีฟอร์มเปล่าให้กรอก (PRD-006) */
export function FormLoadFailed({ onRetry }: { onRetry?: () => void }) {
  return (
    <ErrorState
      title={FORM_LOAD_FAILED}
      action={
        <>
          <RetryButton onRetry={onRetry} />
          <Link href="/seller/products" className="button button-secondary">
            กลับไปรายการสินค้า
          </Link>
        </>
      }
    />
  );
}

/** สัญลักษณ์กำลังโหลดแทนฟอร์ม เกิน 10 วินาทีถือว่าโหลดไม่ได้ (PRD-006) */
export function FormLoading() {
  return (
    <LoadingTimeout failed={<FormLoadFailed />}>
      <LoadingState title="กำลังโหลดข้อมูลสินค้า" />
    </LoadingTimeout>
  );
}
