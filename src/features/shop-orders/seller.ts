import { redirect } from "next/navigation";
import { requireAccount } from "@/shared/session";

/** ร้านของบัญชีที่เปิดหน้าของ ORD ยังไม่เข้าสู่ระบบไปหน้าเข้าสู่ระบบ ยังไม่มีร้านไปหน้าเปิดร้าน (ORD-013) */
export async function requireShopId(next: string): Promise<number> {
  const viewer = await requireAccount(next);
  if (viewer.shopId === null) redirect("/open-shop");
  return viewer.shopId;
}
