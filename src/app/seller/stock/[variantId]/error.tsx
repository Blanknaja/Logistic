"use client";

import { useEffect } from "react";
import { StockErrorState } from "@/features/stock/components/stock-states";

export default function StockHistoryError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <StockErrorState title="โหลดประวัติสต็อกไม่สำเร็จ" onRetry={retry} backToStock />;
}
