"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ErrorState } from "@/shared/ui/states";

/** ข้อมูลไม่มาภายใน 10 วินาทีถือว่าโหลดไม่สำเร็จ */
export const LOADING_TIMEOUT_MS = 10_000;

/**
 * แสดง children ระหว่างรอ เกิน LOADING_TIMEOUT_MS แล้วแสดง failed แทน
 * ไม่ใส่ failed ได้ ErrorState ที่มีปุ่มลองใหม่ซึ่งโหลดที่อยู่เดิมซ้ำ
 */
export function LoadingTimeout({ children, title, failed }: { children: ReactNode; title?: string; failed?: ReactNode }) {
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), LOADING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!timedOut) return children;
  return failed ?? <ErrorState title={title} />;
}
