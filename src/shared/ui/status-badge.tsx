import { ORDER_STATUS, PARCEL_STATUS, PAYMENT_STATUS, PRODUCT_STATUS, SHOP_STATUS } from "@/shared/statuses";

// สีของป้ายเป็นแค่ตัวช่วย ข้อความในป้ายคือคำสถานะเต็มคำเสมอ
const TONE: Record<string, string> = {
  [ORDER_STATUS.awaitingPayment]: "badge-wait",
  [ORDER_STATUS.paid]: "badge-success",
  [ORDER_STATUS.shipping]: "badge-success",
  [ORDER_STATUS.completed]: "badge-done",
  [PARCEL_STATUS.awaitingPacking]: "badge-wait",
  [PARCEL_STATUS.handedOver]: "badge-success",
  [PARCEL_STATUS.inTransit]: "badge-success",
  [PARCEL_STATUS.outForDelivery]: "badge-success",
  [PARCEL_STATUS.delivered]: "badge-done",
  [PARCEL_STATUS.failed]: "badge-alert",
  [PAYMENT_STATUS.pending]: "badge-wait",
  [PAYMENT_STATUS.failed]: "badge-alert",
  [PAYMENT_STATUS.succeededUnused]: "badge-alert",
  [PRODUCT_STATUS.onSale]: "badge-success",
  [PRODUCT_STATUS.draft]: "badge-wait",
  [SHOP_STATUS.open]: "badge-success",
  [SHOP_STATUS.suspended]: "badge-alert",
};

/** class ของป้ายตามคำสถานะ คำที่ไม่อยู่ในตารางได้ป้ายสีเทา */
export const badgeClass = (status: string) => ["badge", TONE[status]].filter(Boolean).join(" ");

/** ป้ายสถานะของคำสั่งซื้อ พัสดุ การจ่ายเงิน สินค้า และร้าน */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return <span className={[badgeClass(status), className].filter(Boolean).join(" ")}>{status}</span>;
}
