"use client";

import { useEffect, useState } from "react";
import { ErrorState, LoadingState } from "@/shared/ui/states";

/** ข้อมูลไม่มาภายใน 10 วินาทีถือว่าโหลดไม่สำเร็จ (ORD-014) */
export const LOADING_TIMEOUT_MS = 10_000;
export const LOAD_FAILED = "โหลดคำสั่งซื้อไม่ได้ตอนนี้";

export function OrdersLoading() {
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), LOADING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);
  return timedOut ? <ErrorState title={LOAD_FAILED} /> : <LoadingState title="กำลังโหลดคำสั่งซื้อ" />;
}
