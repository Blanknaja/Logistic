import type { CurrentAccount } from "@/features/account/server/sessions";
import { notificationPulse, type Pulse } from "@/features/notification/server/notifications";
import { getDb } from "@/shared/db";
import type { FeatureNav } from "@/shared/nav/types";

/** ค่าตั้งต้นของกระดิ่ง นับไม่สำเร็จได้ null กระดิ่งจึงยังแสดงโดยไม่มีตัวเลข และส่วนอื่นของหน้าแสดงครบ (NTF-001) */
export function bellStart(viewer: CurrentAccount): Pulse | null {
  try {
    return notificationPulse(getDb(), viewer.id, 0);
  } catch (error) {
    console.error("นับแจ้งเตือนที่ยังไม่อ่านไม่สำเร็จ", error);
    return null;
  }
}

// กระดิ่งอยู่ใน SiteHeader เอง เพราะต้องอยู่นอกเมนูให้เห็นตัวเลขทุกขนาดจอ
export const nav: FeatureNav = {
  header: [],
  sellerMenu: [],
};
