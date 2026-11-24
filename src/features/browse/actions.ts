"use server";

import type { AddToCartResult } from "@/features/browse/add-to-cart";

/** ใช้จนกว่าตะกร้า (CRT-001) จะมี server action ของตัวเองที่เป็นแบบ AddToCart */
export async function addToCart(): Promise<AddToCartResult> {
  return { ok: false, message: "ยังใส่ตะกร้าไม่ได้ในตอนนี้" };
}
