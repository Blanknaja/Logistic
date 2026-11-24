import { LoadingTimeout } from "@/shared/ui/loading-timeout";
import { LoadingState } from "@/shared/ui/states";

/** รายการที่ไม่มาภายใน 10 วินาทีถือว่าโหลดไม่สำเร็จ (PRD-001 PRD-Q01) */
export const LIST_LOAD_FAILED = "โหลดรายการสินค้าไม่ได้ ลองใหม่อีกครั้ง";

export function ListLoading() {
  return (
    <LoadingTimeout title={LIST_LOAD_FAILED}>
      <LoadingState title="กำลังโหลดรายการสินค้า" />
    </LoadingTimeout>
  );
}
