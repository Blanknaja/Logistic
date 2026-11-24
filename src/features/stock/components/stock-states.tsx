"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RetryButton } from "@/shared/ui/retry-button";
import { ErrorState, LoadingState } from "@/shared/ui/states";

/** ข้อมูลไม่มาภายใน 10 วินาทีถือว่าโหลดไม่สำเร็จ เหมือนหน้าเลือกดูสินค้า */
export const LOADING_TIMEOUT_MS = 10_000;

export function StockErrorState({
  title,
  onRetry,
  backToStock = false,
}: {
  title: string;
  onRetry?: () => void;
  backToStock?: boolean;
}) {
  return (
    <ErrorState
      title={title}
      action={
        <>
          <RetryButton onRetry={onRetry} />
          {backToStock && (
            <Link href="/seller/stock" className="button button-secondary">
              กลับไปหน้าสต็อก
            </Link>
          )}
        </>
      }
    />
  );
}

/** แสดงแทนรายการระหว่างรอ จึงไม่มีช่องให้แก้ตัวเลขจนกว่ารายการจะมา (INV-001 INV-015) */
export function StockLoadingState({
  title,
  failedTitle,
  backToStock = false,
}: {
  title: string;
  failedTitle: string;
  backToStock?: boolean;
}) {
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), LOADING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);
  return timedOut ? <StockErrorState title={failedTitle} backToStock={backToStock} /> : <LoadingState title={title} />;
}
