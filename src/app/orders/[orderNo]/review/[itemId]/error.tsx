"use client";

import { useEffect } from "react";
import { MESSAGES } from "@/features/review/rules";
import { RetryButton } from "@/shared/ui/retry-button";
import { ErrorState } from "@/shared/ui/states";

export default function ReviewsError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorState title={MESSAGES.loadFailed} action={<RetryButton onRetry={retry} />} />;
}
