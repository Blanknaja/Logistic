"use server";

import { redirect } from "next/navigation";
import { loginPath } from "@/features/account/server/login-path";
import type { SaveResult } from "@/features/product-listing/components/product-form";
import { parseProductValues, type SaveIntent } from "@/features/product-listing/server/product-rules";
import { createProduct, deleteProduct, setProductHidden, updateProduct } from "@/features/product-listing/server/products";
import { getDb } from "@/shared/db";
import { formatDateTime } from "@/shared/format";
import { getCurrentAccount } from "@/shared/session";
import { PRODUCT_STATUS } from "@/shared/statuses";

/** ข้อความที่หน้ารายการสินค้าของร้านแสดงตาม ?notice= หลังบันทึก */
export type SavedNotice = "published" | "draft" | "saved" | "deleted";

const LIST_PATH = "/seller/products";

/** ร้านของบัญชีที่เข้าสู่ระบบ ฟอร์มที่ค้างอยู่ในแท็บที่ออกจากระบบไปแล้วถูกพาไปเข้าสู่ระบบใหม่ */
async function sellerShopId(back: string): Promise<number> {
  const viewer = await getCurrentAccount();
  if (!viewer) redirect(loginPath(back, "relogin"));
  if (viewer.shopId === null) redirect("/open-shop");
  return viewer.shopId;
}

function parseInput(intent: SaveIntent, raw: unknown) {
  const values = parseProductValues(raw);
  if (!values || (intent !== "draft" && intent !== "publish")) throw new Error("ข้อมูลสินค้าผิดรูปแบบ");
  return values;
}

/** createToken สุ่มใหม่ทุกครั้งที่เปิดหน้าฟอร์มสินค้าใหม่ กดบันทึกซ้ำจึงได้สินค้าชิ้นเดียว (PRD-013) */
export async function createProductAction(createToken: string, intent: SaveIntent, raw: unknown): Promise<SaveResult> {
  const shopId = await sellerShopId("/seller/products/new");
  const values = parseInput(intent, raw);
  if (typeof createToken !== "string" || !createToken || createToken.length > 100) throw new Error("ข้อมูลสินค้าผิดรูปแบบ");

  const result = createProduct(getDb(), shopId, values, intent, new Date(), createToken);
  if (!result.ok) return { errors: result.errors };
  const notice: SavedNotice = intent === "publish" ? "published" : "draft";
  redirect(`${LIST_PATH}?notice=${notice}`);
}

/** version คือเวลาที่แก้ล่าสุดตอนเปิดหน้าฟอร์ม (PRD-013) */
export async function updateProductAction(productId: number, version: string, intent: SaveIntent, raw: unknown): Promise<SaveResult> {
  const editPath = `${LIST_PATH}/${productId}`;
  const shopId = await sellerShopId(editPath);
  const values = parseInput(intent, raw);
  if (!Number.isSafeInteger(productId) || typeof version !== "string") throw new Error("ข้อมูลสินค้าผิดรูปแบบ");

  const result = updateProduct(getDb(), shopId, productId, version, values, intent);
  // สินค้าถูกลบไประหว่างแก้ หน้าฟอร์มจะแสดง "ไม่พบสินค้านี้" เอง
  if (!result) redirect(editPath);
  if ("errors" in result) return { errors: result.errors };
  if ("changedAt" in result) {
    return { errors: {}, conflict: `สินค้านี้ถูกแก้ไปแล้วเมื่อ ${formatDateTime(result.changedAt)} โหลดข้อมูลล่าสุดก่อนแก้ต่อ` };
  }
  const notice: SavedNotice =
    result.to === PRODUCT_STATUS.draft ? "draft" : result.from === PRODUCT_STATUS.draft ? "published" : "saved";
  redirect(`${LIST_PATH}?notice=${notice}`);
}

/** ปุ่ม "ซ่อน" และ "เลิกซ่อน" ในหน้ารายการ แล้วกลับไปหน้ารายการเดิมพร้อมตัวกรองเดิม (PRD-008) */
export async function setHiddenAction(productId: number, hidden: boolean, back: string): Promise<void> {
  const target = typeof back === "string" && /^\/seller\/products(\?|$)/.test(back) ? back : LIST_PATH;
  const shopId = await sellerShopId(target);
  if (!Number.isSafeInteger(productId) || typeof hidden !== "boolean") throw new Error("ข้อมูลสินค้าผิดรูปแบบ");
  setProductHidden(getDb(), shopId, productId, hidden);
  redirect(target);
}

/** ปุ่ม "ลบ" ในหน้าต่างยืนยัน (PRD-009) */
export async function deleteProductAction(productId: number): Promise<void> {
  const shopId = await sellerShopId(LIST_PATH);
  if (!Number.isSafeInteger(productId)) throw new Error("ข้อมูลสินค้าผิดรูปแบบ");
  deleteProduct(getDb(), shopId, productId);
  const notice: SavedNotice = "deleted";
  redirect(`${LIST_PATH}?notice=${notice}`);
}
