// Next.js เรียก register ครั้งเดียวตอนเซิร์ฟเวอร์เริ่ม งานที่ต้องเกิดตามเวลาโดยไม่มีใครเปิดหน้า เริ่มที่นี่
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getDb } = await import("@/shared/db");
  const { startReceiptAutoCompletion } = await import("@/features/delivery/server/receipt");
  startReceiptAutoCompletion(getDb());
}
