"use server";

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
