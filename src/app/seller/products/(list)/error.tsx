"use client";

import { useEffect } from "react";
import { LIST_LOAD_FAILED } from "@/features/product-listing/components/list-loading";
import { RetryButton } from "@/shared/ui/retry-button";
import { ErrorState } from "@/shared/ui/states";

export default function SellerProductsError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorState title={LIST_LOAD_FAILED} action={<RetryButton onRetry={retry} />} />;
}
