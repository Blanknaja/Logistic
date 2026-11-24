// Next.js เรียก register() ครั้งเดียวตอนเปิดเซิร์ฟเวอร์ งานที่ต้องทำเองตามเวลาเริ่มที่นี่ (ดู docs/architecture.md)
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getDb } = await import("@/shared/db");
  const { startPaymentDeadlineTimer } = await import("@/features/checkout/server/order-groups");
  startPaymentDeadlineTimer(getDb);
}
