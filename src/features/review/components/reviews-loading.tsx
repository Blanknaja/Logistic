import { MESSAGES } from "@/features/review/rules";
import { LoadingTimeout } from "@/shared/ui/loading-timeout";
import { LoadingState } from "@/shared/ui/states";

/** ตัวบอกว่ากำลังโหลดของหน้ารีวิว ข้อมูลไม่มาภายใน 10 วินาทีถือว่าโหลดไม่สำเร็จ (REV-018) */
export function ReviewsLoading() {
  return (
    <LoadingTimeout title={MESSAGES.loadFailed}>
      <LoadingState title="กำลังโหลดรีวิว" />
    </LoadingTimeout>
  );
}
