import { LoadingState } from "@/shared/ui/states";
import { SkeletonExit } from "@/shared/ui/transitions";

export default function Loading() {
  return (
    <SkeletonExit>
      <LoadingState title="กำลังโหลดหน้าจ่ายเงิน" />
    </SkeletonExit>
  );
}
