"use client";

import Link from "next/link";
import { LoadingTimeout } from "@/shared/ui/loading-timeout";
import { RetryButton } from "@/shared/ui/retry-button";
import { ErrorState, LoadingState } from "@/shared/ui/states";

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
  return (
    <LoadingTimeout failed={<StockErrorState title={failedTitle} backToStock={backToStock} />}>
      <LoadingState title={title} />
    </LoadingTimeout>
  );
}
