"use client";

import { useEffect } from "react";
import { RetryButton } from "@/shared/ui/retry-button";
import { ErrorState } from "@/shared/ui/states";

export default function OrdersError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorState title="โหลดคำสั่งซื้อไม่สำเร็จ" action={<RetryButton onRetry={retry} />} />;
}
