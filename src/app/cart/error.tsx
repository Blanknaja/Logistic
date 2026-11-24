"use client";

import { useEffect } from "react";
import { ACTION_FAILED } from "@/features/account/components/action-form";
import { RetryButton } from "@/shared/ui/retry-button";
import { ErrorState } from "@/shared/ui/states";

export default function CartError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorState title={ACTION_FAILED} action={<RetryButton onRetry={retry} />} />;
}
