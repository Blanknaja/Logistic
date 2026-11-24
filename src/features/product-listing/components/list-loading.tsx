"use client";

import { useEffect, useState } from "react";
import { ErrorState, LoadingState } from "@/shared/ui/states";

/** รายการที่ไม่มาภายใน 10 วินาทีถือว่าโหลดไม่สำเร็จ (PRD-001 PRD-Q01) */
export const LIST_TIMEOUT_MS = 10_000;
export const LIST_LOAD_FAILED = "โหลดรายการสินค้าไม่ได้ ลองใหม่อีกครั้ง";

export function ListLoading() {
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), LIST_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);
  return timedOut ? <ErrorState title={LIST_LOAD_FAILED} /> : <LoadingState title="กำลังโหลดรายการสินค้า" />;
}
