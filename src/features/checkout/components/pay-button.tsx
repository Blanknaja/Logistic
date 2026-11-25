import { goToPaymentAction } from "@/features/checkout/buyer-order-actions";
import { PendingButton } from "./pending-button";

/** ปุ่ม "จ่ายเงิน" ของคำสั่งซื้อที่รอจ่ายเงิน ส่งผ่าน server action เพื่อตรวจเวลาหมดเขตก่อน (CHK-008) */
export function PayButton({ orderNo, groupId }: { orderNo: string; groupId: number }) {
  return (
    <form action={goToPaymentAction}>
      <input type="hidden" name="orderNo" value={orderNo} />
      <input type="hidden" name="groupId" value={groupId} />
      <PendingButton label="จ่ายเงิน" pendingLabel="กำลังเปิดหน้าจ่ายเงิน..." />
    </form>
  );
}
