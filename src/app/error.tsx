"use client";

import { useEffect } from "react";
import { ErrorState } from "@/shared/ui/states";
import { RetryButton } from "@/shared/ui/retry-button";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorState action={<RetryButton onRetry={retry} />} />;
}
