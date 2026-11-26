import { StockLoadingState } from "@/features/stock/components/stock-states";
import { SkeletonExit } from "@/shared/ui/transitions";

export default function Loading() {
  return (
    <SkeletonExit>
      <StockLoadingState title="กำลังโหลดสต็อก" failedTitle="โหลดสต็อกไม่สำเร็จ" />
    </SkeletonExit>
  );
}
