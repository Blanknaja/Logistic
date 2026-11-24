import { createOmiseProvider, type OmiseProvider } from "./omise";
import { createSimulator, type Simulator } from "./simulator";

// next dev โหลดโมดูลใหม่บ่อย ตัวจำลองต้องจำ charge ไว้ข้ามคำขอ
const holder = globalThis as { blanksongPaymentSimulator?: Simulator };

/**
 * ผู้ให้บริการจ่ายเงินของแอป อ่านกุญแจจาก OMISE_PUBLIC_KEY และ OMISE_SECRET_KEY เท่านั้น
 * ไม่ใส่ทั้งคู่ได้ตัวจำลองในเครื่อง ใส่ไม่ครบหรือใส่กุญแจที่ไม่ใช่โหมดทดลองจะโยน error
 */
export function getPaymentProvider(env: Record<string, string | undefined> = process.env): OmiseProvider | Simulator {
  const publicKey = env.OMISE_PUBLIC_KEY?.trim();
  const secretKey = env.OMISE_SECRET_KEY?.trim();
  if (!publicKey && !secretKey) return (holder.blanksongPaymentSimulator ??= createSimulator());
  if (!publicKey || !secretKey) throw new Error("ต้องใส่ทั้ง OMISE_PUBLIC_KEY และ OMISE_SECRET_KEY หรือไม่ใส่ทั้งคู่เพื่อใช้ตัวจำลอง");
  // รุ่นนี้ไม่รับเงินจริง กุญแจทดลองของ Omise มีคำว่า _test_ เสมอ
  if (!publicKey.includes("_test_") || !secretKey.includes("_test_")) throw new Error("ใช้ได้เฉพาะกุญแจโหมดทดลองของ Omise");
  return createOmiseProvider({ publicKey, secretKey });
}
