"use client";

import { useEffect } from "react";
import { LOAD_FAILED } from "@/features/shop-orders/components/orders-loading";
import { RetryButton } from "@/shared/ui/retry-button";
import { ErrorState } from "@/shared/ui/states";

export default function OrdersError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorState title={LOAD_FAILED} action={<RetryButton onRetry={retry} />} />;
}
