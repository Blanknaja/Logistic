"use client";

import { useEffect } from "react";
import { StockErrorState } from "@/features/stock/components/stock-states";

export default function StockError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <StockErrorState title="โหลดสต็อกไม่สำเร็จ" onRetry={retry} />;
}
