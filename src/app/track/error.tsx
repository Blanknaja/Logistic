"use client";

import { useEffect } from "react";
import { LOAD_FAILED } from "@/features/delivery/components/tracking-skeleton";
import { RetryButton } from "@/shared/ui/retry-button";
import { ErrorState } from "@/shared/ui/states";

export default function TrackingError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorState title={LOAD_FAILED} action={<RetryButton onRetry={retry} />} />;
}
