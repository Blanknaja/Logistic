"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { parcelHref } from "@/features/shop-orders/paths";
import { requireShopId } from "@/features/shop-orders/seller";
import { shippingTarget, shopOrdersVersion } from "@/features/shop-orders/server/orders";
import { getDb } from "@/shared/db";

// ไม่มี action ที่เปลี่ยนสถานะ แก้สินค้า ยอดเงิน หรือที่อยู่ของคำสั่งซื้อ (ORD-015)

/** ปุ่ม "จัดส่ง": พาไปหน้าจัดส่งของพัสดุ หรือคืนข้อความถ้าจัดส่งไม่ได้แล้ว (ORD-009) */
export async function openShippingAction(_previous: { error: string } | null, formData: FormData): Promise<{ error: string }> {
  const orderNo = String(formData.get("orderNo") ?? "");
  const shopId = await requireShopId(`/seller/orders/${encodeURIComponent(orderNo)}`);
  const target = shippingTarget(getDb(), shopId, orderNo);
  if (target.ok) redirect(parcelHref(target.trackingNo));
  // สถานะที่หน้าแสดงอยู่ไม่ตรงแล้ว ให้หน้าโหลดสถานะใหม่พร้อมข้อความ
  refresh();
  return { error: target.error };
}

/** ค่าที่หน้าเปิดค้างใช้เทียบว่ามีอะไรเปลี่ยน (ORD-010 ORD-011) */
export async function shopOrdersVersionAction(): Promise<string> {
  return shopOrdersVersion(getDb(), await requireShopId("/seller/orders"));
}
