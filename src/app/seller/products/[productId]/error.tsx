"use client";

import { useEffect } from "react";
import { FormLoadFailed } from "@/features/product-listing/components/form-loading";

export default function EditProductError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <FormLoadFailed onRetry={retry} />;
}
