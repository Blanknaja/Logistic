"use server";

import { redirect } from "next/navigation";
import { loginPath } from "@/features/account/server/login-path";
import { parseProductValues, type ProductErrors, type SaveIntent } from "@/features/product-listing/server/product-rules";
import { createProduct } from "@/features/product-listing/server/products";
import { getDb } from "@/shared/db";
import { getCurrentAccount } from "@/shared/session";

/** ข้อความที่หน้ารายการสินค้าของร้านแสดงตาม ?notice= หลังบันทึก */
export type SavedNotice = "published" | "draft";

export async function createProductAction(intent: SaveIntent, raw: unknown): Promise<{ errors: ProductErrors }> {
  const viewer = await getCurrentAccount();
  // ฟอร์มค้างอยู่ในแท็บที่ออกจากระบบไปแล้ว
  if (!viewer) redirect(loginPath("/seller/products/new", "relogin"));
  if (viewer.shopId === null) redirect("/open-shop");
  const values = parseProductValues(raw);
  if (!values || (intent !== "draft" && intent !== "publish")) throw new Error("ข้อมูลสินค้าผิดรูปแบบ");

  const result = createProduct(getDb(), viewer.shopId, values, intent);
  if (!result.ok) return { errors: result.errors };
  const notice: SavedNotice = intent === "publish" ? "published" : "draft";
  redirect(`/seller/products?notice=${notice}`);
}
