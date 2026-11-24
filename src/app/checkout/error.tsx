"use client";

import { useEffect } from "react";
import { RetryButton } from "@/shared/ui/retry-button";
import { ErrorState } from "@/shared/ui/states";

export default function CheckoutError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorState title="โหลดหน้าสั่งซื้อไม่สำเร็จ" action={<RetryButton onRetry={retry} />} />;
}
