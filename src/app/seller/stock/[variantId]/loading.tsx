import { StockLoadingState } from "@/features/stock/components/stock-states";

export default function Loading() {
  return <StockLoadingState title="กำลังโหลดประวัติสต็อก" failedTitle="โหลดประวัติสต็อกไม่สำเร็จ" backToStock />;
}
