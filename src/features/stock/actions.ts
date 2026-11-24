"use server";

import { redirect } from "next/navigation";
import { loginPath } from "@/features/account/server/login-path";
import { setStock, type SaveStockResult } from "@/features/stock/server/stock";
import { getDb } from "@/shared/db";
import { getCurrentAccount } from "@/shared/session";

export async function saveStockAction(formData: FormData): Promise<SaveStockResult> {
  const viewer = await getCurrentAccount();
  if (!viewer) redirect(loginPath("/seller/stock", "relogin"));
  const value = formData.get("stock");
  return setStock(getDb(), viewer.shopId, {
    variantId: Number(formData.get("variantId")),
    expected: Number(formData.get("expected")),
    value: typeof value === "string" ? value : "",
  });
}
