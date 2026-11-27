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
import { getCurrentAccount, peekCurrentAccount, requireAccount } from "@/shared/session";

// ทุก action ใช้บัญชีของคำขอเอง ไม่รับเลขบัญชีจากหน้าเว็บ จึงเห็นและเปลี่ยนได้เฉพาะแจ้งเตือนของตัวเอง (NTF-016)

/** component ที่ถามในคำขอเดียวกันได้ไม่เกินเท่านี้ คือกระดิ่งกับแถบแจ้งเตือนใหม่ และเผื่ออีกเท่าตัว */
const MAX_PULSES = 4;

/**
 * หน้าที่เปิดค้างถามเป็นระยะ (NTF-014) หนึ่งคำขอตอบทุก component ของหน้านั้น ตามลำดับของ sinceIds
 * null เมื่อเครื่องนี้ออกจากระบบแล้ว การถามนี้ไม่ต่ออายุการเข้าสู่ระบบ
 */
export async function notificationPulseAction(sinceIds: number[]): Promise<Pulse[] | null> {
  const viewer = await peekCurrentAccount();
  if (!viewer) return null;
  const asked = Array.isArray(sinceIds) ? sinceIds.slice(0, MAX_PULSES) : [];
  return asked.map((sinceId) => notificationPulse(getDb(), viewer.id, Number(sinceId)));
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
