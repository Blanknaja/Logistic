"use client";

import { useEffect } from "react";
import { RetryButton } from "@/shared/ui/retry-button";
import { ErrorState } from "@/shared/ui/states";

export default function PayError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorState title="โหลดหน้าจ่ายเงินไม่ได้ ลองใหม่อีกครั้ง" action={<RetryButton onRetry={retry} />} />;
}
