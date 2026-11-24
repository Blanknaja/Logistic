import { StockLoadingState } from "@/features/stock/components/stock-states";

export default function Loading() {
  return <StockLoadingState title="กำลังโหลดสต็อก" failedTitle="โหลดสต็อกไม่สำเร็จ" />;
}
