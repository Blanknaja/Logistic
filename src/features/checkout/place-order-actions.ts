"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { parseCheckoutLines, placeOrder, type PlaceOrderFailure } from "@/features/checkout/server/checkout";
import { getDb } from "@/shared/db";
import { requireAccount } from "@/shared/session";

/** ปุ่ม "สั่งซื้อ" ในหน้าสั่งซื้อ สำเร็จแล้วพาไปหน้าจ่ายเงินของกลุ่มคำสั่งซื้อ (CHK-005) */
export async function placeOrderAction(formData: FormData): Promise<PlaceOrderFailure> {
  const viewer = await requireAccount("/checkout");
  const addressId = Number(formData.get("addressId"));
  const result = placeOrder(getDb(), {
    buyerAccountId: viewer.id,
    addressId: Number.isSafeInteger(addressId) && addressId > 0 ? addressId : null,
    orderKey: String(formData.get("orderKey") ?? ""),
    lines: parseCheckoutLines(formData.get("lines")),
  });
  if (result.ok) redirect(`/pay/${result.groupId}`);
  // ให้หน้าสั่งซื้อแสดงราคาและสต็อกล่าสุดคู่กับข้อความที่ได้
  refresh();
  return result;
}
