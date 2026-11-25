import { LoadingTimeout } from "@/shared/ui/loading-timeout";
import { LoadingState } from "@/shared/ui/states";

/** ข้อมูลไม่มาภายใน 10 วินาทีถือว่าโหลดไม่สำเร็จ (ORD-014) */
export const LOAD_FAILED = "โหลดคำสั่งซื้อไม่ได้ตอนนี้";

export function OrdersLoading() {
  return (
    <LoadingTimeout title={LOAD_FAILED}>
      <LoadingState title="กำลังโหลดคำสั่งซื้อ" />
    </LoadingTimeout>
  );
}
