"use server";

import { redirect } from "next/navigation";
import { requireShopInAction } from "@/features/shop/require-shop";
import { setStock, type SaveStockResult } from "@/features/stock/server/stock";
import { getDb } from "@/shared/db";

export async function saveStockAction(formData: FormData): Promise<SaveStockResult> {
  const viewer = await requireShopInAction("/seller/stock");
  const value = formData.get("stock");
  return setStock(getDb(), viewer.shopId, {
    variantId: Number(formData.get("variantId")),
    expected: Number(formData.get("expected")),
    value: typeof value === "string" ? value : "",
  });
}

/** ทางของเบราว์เซอร์ที่ไม่มี JavaScript: บันทึกแล้วกลับไปหน้าสต็อกเดิม พร้อมผลของแถวที่บันทึกใน ?saved= และ ?outcome= */
export async function saveStockFormAction(formData: FormData): Promise<void> {
  const result = await saveStockAction(formData);
  const back = formData.get("back");
  const url = new URL(typeof back === "string" && /^\/seller\/stock(\?|$)/.test(back) ? back : "/seller/stock", "http://localhost");
  url.searchParams.set("saved", String(formData.get("variantId")));
  url.searchParams.set("outcome", result.outcome);
  redirect(url.pathname + url.search);
}
