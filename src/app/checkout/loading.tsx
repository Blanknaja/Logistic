import { LoadingState } from "@/shared/ui/states";
import { SkeletonExit } from "@/shared/ui/transitions";

export default function Loading() {
  return (
    <SkeletonExit>
      <LoadingState title="กำลังโหลดหน้าสั่งซื้อ" />
    </SkeletonExit>
  );
}
