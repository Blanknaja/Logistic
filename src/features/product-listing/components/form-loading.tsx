"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RetryButton } from "@/shared/ui/retry-button";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { LIST_TIMEOUT_MS } from "./list-loading";

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
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), LIST_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);
  return timedOut ? <FormLoadFailed /> : <LoadingState title="กำลังโหลดข้อมูลสินค้า" />;
}
