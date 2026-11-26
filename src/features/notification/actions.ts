"use server";

import { refresh } from "next/cache";
import {
  latestNotifications,
  markAllRead,
  notificationPulse,
  type BellList,
  type Pulse,
} from "@/features/notification/server/notifications";
import { getDb } from "@/shared/db";
import { getCurrentAccount, requireAccount } from "@/shared/session";

// ทุก action ใช้บัญชีของคำขอเอง ไม่รับเลขบัญชีจากหน้าเว็บ จึงเห็นและเปลี่ยนได้เฉพาะแจ้งเตือนของตัวเอง (NTF-016)

/** หน้าที่เปิดค้างถามเป็นระยะ (NTF-014) null เมื่อเครื่องนี้ออกจากระบบแล้ว */
export async function notificationPulseAction(sinceId: number): Promise<Pulse | null> {
  const viewer = await getCurrentAccount();
  return viewer ? notificationPulse(getDb(), viewer.id, Number(sinceId)) : null;
}

/** รายการใต้กระดิ่ง (NTF-002) null เมื่อเครื่องนี้ออกจากระบบแล้ว */
export async function latestNotificationsAction(): Promise<BellList | null> {
  const viewer = await getCurrentAccount();
  return viewer ? latestNotifications(getDb(), viewer.id) : null;
}

/** ปุ่ม "อ่านทั้งหมดแล้ว" (NTF-005) */
export async function markAllReadAction(): Promise<void> {
  const viewer = await requireAccount("/notifications");
  markAllRead(getDb(), viewer.id);
  refresh();
}
