import { redirect } from "next/navigation";
import { requireAccount, type CurrentAccount } from "@/shared/session";

/**
 * หน้าในหลังบ้านของร้านเรียกตัวนี้แทน requireAccount (SHP-001)
 * ยังไม่เข้าสู่ระบบ ไปหน้าเข้าสู่ระบบแล้วกลับมาที่ next ยังไม่มีร้าน ไปหน้าเปิดร้าน
 */
export async function requireShop(next: string): Promise<CurrentAccount & { shopId: number }> {
  const viewer = await requireAccount(next);
  if (viewer.shopId === null) redirect("/open-shop");
  return { ...viewer, shopId: viewer.shopId };
}
