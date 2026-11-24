import { redirect } from "next/navigation";
import { requireAccount, type CurrentAccount } from "@/shared/session";

/** หน้าที่ต้องเป็นผู้ขาย: ยังไม่เข้าสู่ระบบพาไปหน้าเข้าสู่ระบบ ยังไม่มีร้านพาไปหน้าเปิดร้าน (PRD-012) */
export async function requireSeller(next: string): Promise<CurrentAccount & { shopId: number }> {
  const viewer = await requireAccount(next);
  if (viewer.shopId === null) redirect("/open-shop");
  return { ...viewer, shopId: viewer.shopId };
}
