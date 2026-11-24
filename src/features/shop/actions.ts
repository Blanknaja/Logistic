"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loginPath } from "@/features/account/server/login-path";
import { SHOP_FIELDS, type ShopErrors, type ShopInput } from "@/features/shop/server/rules";
import { openShop, updateShopSettings, type LogoChange, type LogoUpload } from "@/features/shop/server/shops";
import { listStorefrontProducts, type StorefrontCursor, type StorefrontPage } from "@/features/shop/server/storefront";
import { getDb } from "@/shared/db";
import { getCurrentAccount } from "@/shared/session";

/** ผลที่ฟอร์มร้านได้กลับไป notice คือเหตุที่บันทึกไม่ได้ทั้งฟอร์ม */
export type ShopFormState = { errors: ShopErrors; notice?: "admin" | "not-found" | "suspended" };

function shopInput(formData: FormData): ShopInput {
  return Object.fromEntries(
    SHOP_FIELDS.map((field) => {
      const value = formData.get(field);
      return [field, typeof value === "string" ? value : ""];
    }),
  ) as ShopInput;
}

async function logoUpload(formData: FormData): Promise<LogoUpload | undefined> {
  const file = formData.get("logo");
  // ไม่ได้เลือกรูป เบราว์เซอร์ยังส่งไฟล์ว่างมา
  if (!(file instanceof File) || file.size === 0) return undefined;
  return { bytes: new Uint8Array(await file.arrayBuffer()) };
}

export async function openShopAction(formData: FormData): Promise<ShopFormState> {
  const viewer = await getCurrentAccount();
  if (!viewer) redirect(loginPath("/open-shop", "relogin"));
  const result = openShop(getDb(), viewer.id, shopInput(formData), await logoUpload(formData));
  if (!result.ok) {
    if (!("reason" in result)) return { errors: result.errors };
    // เปิดร้านจากอีกหน้าจอไปแล้ว (SHP-005)
    if (result.reason === "has-shop") redirect("/seller?notice=has-shop");
    return { errors: {}, notice: result.reason };
  }
  // แถบด้านบนต้องเปลี่ยนจาก "เปิดร้าน" เป็น "ร้านของฉัน"
  revalidatePath("/", "layout");
  redirect("/seller?notice=opened");
}

export async function saveShopSettingsAction(formData: FormData): Promise<ShopFormState> {
  const viewer = await getCurrentAccount();
  // ฟอร์มค้างอยู่ในแท็บที่การเข้าสู่ระบบหมดอายุแล้ว (SHP-015)
  if (!viewer) redirect(loginPath("/seller/settings", "relogin"));
  const logo: LogoChange = formData.get("removeLogo") === "1" ? "remove" : await logoUpload(formData);
  // ส่งเลขร้านที่ฟอร์มเปิดมาด้วย ถ้าบัญชีเปลี่ยนไประหว่างนั้น จะไม่ไปแก้ร้านของบัญชีใหม่
  const shopId = Number(formData.get("shopId")) || 0;
  const result = updateShopSettings(getDb(), viewer.id, shopId, shopInput(formData), logo);
  if (!result.ok) return "reason" in result ? { errors: {}, notice: result.reason } : { errors: result.errors };
  revalidatePath("/", "layout");
  redirect("/seller/settings?saved=1");
}

/** สินค้าชุดถัดไปของหน้าร้าน สำหรับปุ่ม "ดูเพิ่ม" (SHP-011) */
export async function loadMoreShopProductsAction(shopId: number, after: StorefrontCursor): Promise<StorefrontPage> {
  if (!Number.isInteger(shopId) || typeof after?.publishedAt !== "string" || !Number.isInteger(after?.id)) {
    return { items: [], next: null };
  }
  return listStorefrontProducts(getDb(), shopId, { publishedAt: after.publishedAt, id: after.id });
}
