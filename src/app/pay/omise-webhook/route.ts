import { getPaymentProvider } from "@/features/payment/server/config";
import { handleChargeNotification } from "@/features/payment/server/payments";
import { getDb } from "@/shared/db";

// ที่อยู่สำหรับตั้งเป็น webhook ในหน้าจัดการของ Omise ผลที่แจ้งมาถูกถามกลับก่อนใช้เสมอ (PAY-015)
export async function POST(request: Request): Promise<Response> {
  const event = (await request.json().catch(() => null)) as { object?: string; key?: string; data?: { id?: unknown; amount?: unknown } } | null;
  const charge = event?.data;
  if (event?.object !== "event" || !event.key?.startsWith("charge.") || typeof charge?.id !== "string") {
    return Response.json({ result: "ignored" });
  }
  const result = await handleChargeNotification(getDb(), getPaymentProvider(), {
    chargeId: charge.id,
    // Omise ส่งยอดเป็นหน่วยย่อย 1 บาท = 100
    amount: typeof charge.amount === "number" ? charge.amount / 100 : undefined,
  });
  return Response.json({ result }, { status: result === "error" ? 503 : 200 });
}
