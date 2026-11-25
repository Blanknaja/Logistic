import { redirect } from "next/navigation";
import { loginPath } from "@/features/account/server/login-path";
import { getCurrentAccount, requireAccount, type CurrentAccount } from "@/shared/session";

/**
 * หน้าในหลังบ้านของร้านเรียกตัวนี้แทน requireAccount (SHP-001)
 * ยังไม่เข้าสู่ระบบ ไปหน้าเข้าสู่ระบบแล้วกลับมาที่ next ยังไม่มีร้าน ไปหน้าเปิดร้าน
 */
export async function requireShop(next: string): Promise<CurrentAccount & { shopId: number }> {
  const viewer = await requireAccount(next);
  if (viewer.shopId === null) redirect("/open-shop");
  return { ...viewer, shopId: viewer.shopId };
}

/**
 * server action ของหลังบ้านเรียกตัวนี้ ฟอร์มที่ค้างในแท็บที่ออกจากระบบไปแล้ว ไปหน้าเข้าสู่ระบบพร้อมข้อความให้เข้าสู่ระบบอีกครั้ง
 * แล้วกลับมาที่ back ยังไม่มีร้าน ไปหน้าเปิดร้าน
 */
export async function requireShopInAction(back: string): Promise<CurrentAccount & { shopId: number }> {
  const viewer = await getCurrentAccount();
  if (!viewer) redirect(loginPath(back, "relogin"));
  if (viewer.shopId === null) redirect("/open-shop");
  return { ...viewer, shopId: viewer.shopId };
}
