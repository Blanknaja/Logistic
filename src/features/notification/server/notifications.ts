import type { Db } from "@/shared/db";
import { PAGE_SIZE, pageCount } from "@/shared/paging";

/** ชนิดของแจ้งเตือนทั้ง 11 ชนิด ตามตารางใน notification.md ส่วนที่ 5 */
export const NOTIFICATION_TYPE = {
  paymentSucceeded: "payment-succeeded",
  paymentFailed: "payment-failed",
  paymentTimedOut: "payment-timed-out",
  parcelStatus: "parcel-status",
  orderCancelled: "order-cancelled",
  reviewReplied: "review-replied",
  reviewHidden: "review-hidden",
  shopNewOrder: "shop-new-order",
  shopOrderCompleted: "shop-order-completed",
  shopNewReview: "shop-new-review",
  shopStockEmpty: "shop-stock-empty",
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPE)[keyof typeof NOTIFICATION_TYPE];

/** รายการใต้กระดิ่งแสดงไม่เกินเท่านี้ (NTF-002) */
export const BELL_LIST_SIZE = 10;

export const NOTIFICATION_NOT_FOUND = "ไม่พบแจ้งเตือน";
export const NO_NOTIFICATIONS = "ยังไม่มีแจ้งเตือน";
export const NOTIFICATIONS_LOAD_FAILED = "โหลดแจ้งเตือนไม่สำเร็จ";
export const MARK_ALL_READ = "อ่านทั้งหมดแล้ว";

/** ที่อยู่ที่กดแล้วเปิดแจ้งเตือน: เปลี่ยนเป็นอ่านแล้ว แล้วพาไปหน้าที่เกี่ยวข้อง (NTF-004) */
export const notificationHref = (id: number) => `/notifications/${id}`;

/** ตัวเลขที่กระดิ่ง ไม่มีตัวเลขเมื่อเป็น 0 (NTF-001) */
export const badgeText = (unread: number) => (unread > 99 ? "99+" : unread > 0 ? String(unread) : "");

/** ชื่อของกระดิ่งที่โปรแกรมอ่านจอได้ยิน (NTF-001) */
export const bellLabel = (unread: number) => (unread > 0 ? `แจ้งเตือน ยังไม่อ่าน ${unread} รายการ` : "แจ้งเตือน");

export type NewNotification = {
  accountId: number;
  type: NotificationType;
  message: string;
  /** หน้าที่เกี่ยวข้อง */
  href: string;
  /** ชื่อของเหตุการณ์ต้นทาง เหตุการณ์เดียวกันที่เข้ามาซ้ำได้แจ้งเตือนรายการเดียวต่อผู้รับ (NTF-016) */
  eventKey: string;
};

/** สร้างแจ้งเตือน `ยังไม่อ่าน` คืน false เมื่อเหตุการณ์นี้เคยแจ้งผู้รับคนนี้แล้ว */
export function addNotification(db: Db, input: NewNotification, now: Date = new Date()): boolean {
  const result = db
    .prepare(
      `INSERT INTO notifications (account_id, type, message, href, event_key, created_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (account_id, event_key) DO NOTHING`,
    )
    .run(input.accountId, input.type, input.message, input.href, input.eventKey, now.toISOString());
  return result.changes > 0;
}

export type NotificationItem = { id: number; message: string; createdAt: string; read: boolean };

type Row = { id: number; message: string; created_at: string; read_at: string | null };

const toItem = (row: Row): NotificationItem => ({ id: row.id, message: row.message, createdAt: row.created_at, read: row.read_at !== null });

const LIST_SQL = `SELECT id, message, created_at, read_at FROM notifications WHERE account_id = ?
  ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`;

export function countUnread(db: Db, accountId: number): number {
  return Number(db.prepare("SELECT count(*) AS n FROM notifications WHERE account_id = ? AND read_at IS NULL").get(accountId)?.n);
}

/** สิ่งที่หน้าเปิดค้างถามเป็นระยะ (NTF-014) newCount คือจำนวนที่เกิดหลังรายการ sinceId */
export type Pulse = { unread: number; latestId: number; newCount: number };

export function notificationPulse(db: Db, accountId: number, sinceId: number): Pulse {
  const row = db
    .prepare("SELECT coalesce(max(id), 0) AS latest, coalesce(sum(id > ?), 0) AS fresh FROM notifications WHERE account_id = ?")
    .get(Number.isSafeInteger(sinceId) ? sinceId : 0, accountId);
  return { unread: countUnread(db, accountId), latestId: Number(row?.latest), newCount: Number(row?.fresh) };
}

export type BellList = Pulse & { items: NotificationItem[] };

/** รายการล่าสุดใต้กระดิ่ง เรียงจากใหม่ไปเก่า (NTF-002) */
export function latestNotifications(db: Db, accountId: number): BellList {
  const items = (db.prepare(LIST_SQL).all(accountId, BELL_LIST_SIZE, 0) as Row[]).map(toItem);
  return { ...notificationPulse(db, accountId, 0), items };
}

export type NotificationPage = Pulse & { items: NotificationItem[]; total: number; page: number; pageCount: number };

/** หน้าแจ้งเตือน หน้าละ 20 รายการ เลขหน้าที่เกินได้หน้าสุดท้ายที่มีอยู่จริง (NTF-003) */
export function listNotifications(db: Db, accountId: number, requestedPage = 1): NotificationPage {
  const total = Number(db.prepare("SELECT count(*) AS n FROM notifications WHERE account_id = ?").get(accountId)?.n);
  const pages = pageCount(total);
  const page = Number.isSafeInteger(requestedPage) ? Math.min(Math.max(requestedPage, 1), pages) : 1;
  const items = (db.prepare(LIST_SQL).all(accountId, PAGE_SIZE, (page - 1) * PAGE_SIZE) as Row[]).map(toItem);
  return { ...notificationPulse(db, accountId, 0), items, total, page, pageCount: pages };
}

/**
 * เจ้าของกดแจ้งเตือน: เปลี่ยนเป็น `อ่านแล้ว` แล้วคืนหน้าที่เกี่ยวข้อง กดซ้ำได้หน้าเดิม (NTF-004)
 * null เมื่อไม่มีแจ้งเตือนนี้หรือเป็นของบัญชีอื่น ซึ่งไม่เปลี่ยนอะไร (NTF-016)
 */
export function openNotification(db: Db, accountId: number, id: number, now: Date = new Date()): string | null {
  if (!Number.isSafeInteger(id)) return null;
  const row = db
    .prepare("UPDATE notifications SET read_at = coalesce(read_at, ?) WHERE id = ? AND account_id = ? RETURNING href")
    .get(now.toISOString(), id, accountId);
  return row ? String(row.href) : null;
}

/** เปลี่ยนแจ้งเตือนทุกรายการของบัญชีนี้ที่มีอยู่ตอนนี้เป็น `อ่านแล้ว` รวมหน้าอื่น คืนจำนวนที่เปลี่ยน (NTF-005) */
export function markAllRead(db: Db, accountId: number, now: Date = new Date()): number {
  return Number(
    db.prepare("UPDATE notifications SET read_at = ? WHERE account_id = ? AND read_at IS NULL").run(now.toISOString(), accountId).changes,
  );
}
