"use client";

import { useEffect } from "react";
import { RetryButton } from "@/shared/ui/retry-button";
import { ErrorState } from "@/shared/ui/states";

export default function AddressesError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorState title="โหลดที่อยู่ไม่สำเร็จ" action={<RetryButton onRetry={retry} />} />;
}
