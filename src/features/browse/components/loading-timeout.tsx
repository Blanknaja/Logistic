"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ErrorState } from "@/shared/ui/states";

/** ข้อมูลไม่มาภายใน 10 วินาทีถือว่าโหลดไม่สำเร็จ (BRW-013) ปุ่มลองใหม่โหลดที่อยู่เดิมซ้ำ */
export const LOADING_TIMEOUT_MS = 10_000;

export function LoadingTimeout({ children, title }: { children: ReactNode; title?: string }) {
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), LOADING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);
  return timedOut ? <ErrorState title={title} /> : children;
}
