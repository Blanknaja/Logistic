"use client";

import { useEffect } from "react";
import { RetryButton } from "@/shared/ui/retry-button";
import { ErrorState } from "@/shared/ui/states";

export default function ParcelStatusError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorState title="โหลดข้อมูลไม่ได้ตอนนี้" action={<RetryButton onRetry={retry} />} />;
}
