"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { loginPath } from "@/features/account/server/login-path";
import { confirmReceipt } from "@/features/delivery/server/receipt";
import { getDb } from "@/shared/db";
import { getCurrentAccount } from "@/shared/session";

export async function confirmReceiptAction(formData: FormData): Promise<{ error: string | null }> {
  const value = formData.get("trackingNo");
  const trackingNo = typeof value === "string" ? value : "";
  const viewer = await getCurrentAccount();  if (!viewer) redirect(loginPath(`/track/${encodeURIComponent(trackingNo)}`, "relogin"));
  const result = confirmReceipt(getDb(), trackingNo, viewer);
  if (!result.ok) return { error: result.error };
  // ให้หน้าติดตามพัสดุแสดงข้อความยืนยันจากฐานข้อมูล แทนปุ่มที่เพิ่งกด
  refresh();
  return { error: null };
}
