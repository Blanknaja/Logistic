import { beforeEach, describe, expect, test } from "vitest";
import type { Db } from "@/shared/db";
import { addAccount } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";
import {
  addNotification,
  badgeText,
  bellLabel,
  countUnread,
  latestNotifications,
  listNotifications,
  markAllRead,
  NOTIFICATION_TYPE,
  notificationPulse,
  openNotification,
} from "./notifications";

let db: Db;
let somying: number;
let somchai: number;
let mana: number;

beforeEach(() => {
  db = createTestDb();
  somying = addAccount(db, { displayName: "สมหญิง" }).id;
  somchai = addAccount(db, { displayName: "สมชาย" }).id;
  mana = addAccount(db, { displayName: "มานะ" }).id;
});

const at = (time: string, day = "2026-11-26") => new Date(`${day}T${time}:00+07:00`);

let serial = 0;
/** แจ้งเตือนเรื่องพัสดุหนึ่งรายการ คืนเลขของรายการ */
function note(accountId: number, when: Date, message = `พัสดุ ${++serial}`): number {
  addNotification(db, { accountId, type: NOTIFICATION_TYPE.parcelStatus, message, href: `/track/BS${String(serial).padStart(10, "0")}`, eventKey: `test:${++serial}` }, when);
  return Number(db.prepare("SELECT max(id) AS id FROM notifications").get()?.id);
}

/** count รายการ ห่างกันรายการละ 1 นาทีนับจาก start โดย unread รายการล่าสุดยังไม่อ่าน */
function fill(accountId: number, count: number, unread: number, start = at("10:00", "2026-11-24")): number[] {
  const ids = Array.from({ length: count }, (_, i) => note(accountId, new Date(start.getTime() + i * 60_000)));
  for (const id of ids.slice(0, count - unread)) openNotification(db, accountId, id, at("08:00"));
  return ids;
}

describe("NTF-001 กระดิ่งและจำนวนที่ยังไม่อ่าน", () => {
  test("NTF-001 นับเฉพาะแจ้งเตือนที่ยังไม่อ่านของบัญชีนั้น ไม่แสดงตัวเลขเมื่อเป็น 0 และแสดง 99+ เมื่อมากกว่า 99", () => {
    fill(somying, 12, 3);
    fill(somchai, 2, 2);

    expect(countUnread(db, somying)).toBe(3);
    expect([badgeText(0), badgeText(3), badgeText(99), badgeText(100)]).toEqual(["", "3", "99", "99+"]);
    expect([bellLabel(0), bellLabel(3)]).toEqual(["แจ้งเตือน", "แจ้งเตือน ยังไม่อ่าน 3 รายการ"]);
  });
});

describe("NTF-002 รายการล่าสุดเมื่อกดกระดิ่ง", () => {
  test("NTF-002 ได้ 10 รายการล่าสุดเรียงจากใหม่ไปเก่า พร้อมเครื่องหมายยังไม่อ่าน และการดูรายการไม่ทำให้อ่านแล้ว", () => {
    fill(somying, 11, 2);
    note(somying, at("08:50"), "พัสดุ BS0000000123 จากร้าน สมชายการช่าง เป็น ร้านส่งของแล้ว");

    const list = latestNotifications(db, somying);

    expect(list.items).toHaveLength(10);
    expect(list.items[0]).toMatchObject({ message: "พัสดุ BS0000000123 จากร้าน สมชายการช่าง เป็น ร้านส่งของแล้ว", createdAt: at("08:50").toISOString(), read: false });
    expect(list.items.map((item) => item.createdAt)).toEqual([...list.items.map((item) => item.createdAt)].sort().reverse());
    expect(list.items.filter((item) => !item.read)).toHaveLength(3);
    expect(latestNotifications(db, somying).unread).toBe(3);
  });
});

describe("NTF-003 หน้าแจ้งเตือน", () => {
  test("NTF-003 45 รายการแบ่งเป็น 3 หน้า หน้าละ 20 หน้าสุดท้ายมี 5 รายการและจบที่รายการเก่าสุด", () => {
    fill(somchai, 45, 6);

    const first = listNotifications(db, somchai, 1);
    const last = listNotifications(db, somchai, 3);

    expect([first.items.length, first.page, first.pageCount, first.total, first.unread]).toEqual([20, 1, 3, 45, 6]);
    expect(last.items).toHaveLength(5);
    expect(last.items.at(-1)?.createdAt).toBe(at("10:00", "2026-11-24").toISOString());
  });

  test("NTF-003 เลขหน้าที่เกินหรือผิดรูปแบบได้หน้าที่มีอยู่จริง ไม่ใช่หน้าเปล่า", () => {
    fill(somchai, 45, 0);

    expect(listNotifications(db, somchai, 9)).toMatchObject({ page: 3, pageCount: 3 });
    expect(listNotifications(db, somchai, 9).items).toHaveLength(5);
    expect(listNotifications(db, somchai, Number.NaN).page).toBe(1);
    expect(listNotifications(db, somchai, -2).page).toBe(1);
  });

  test("NTF-017 บัญชีที่ไม่มีแจ้งเตือนได้รายการว่าง หน้าเดียว", () => {
    expect(listNotifications(db, mana)).toMatchObject({ items: [], total: 0, page: 1, pageCount: 1, unread: 0 });
    expect(latestNotifications(db, mana).items).toEqual([]);
  });
});

describe("NTF-004 เปิดแจ้งเตือนแล้วไปหน้าที่เกี่ยวข้อง", () => {
  test("NTF-004 เจ้าของกดแจ้งเตือน ได้หน้าที่เกี่ยวข้อง รายการนั้นเป็นอ่านแล้ว และจำนวนที่ยังไม่อ่านลดลง 1", () => {
    const [, , third] = fill(somying, 3, 3);

    expect(openNotification(db, somying, third, at("09:20"))).toMatch(/^\/track\/BS\d{10}$/);

    expect(countUnread(db, somying)).toBe(2);
    expect(latestNotifications(db, somying).items[0]).toMatchObject({ id: third, read: true });
  });

  test("NTF-004 กดรายการเดิมซ้ำจากอีกหน้าต่างได้หน้าเดิม จำนวนลดครั้งเดียว และบัญชีอื่นเปิดไม่ได้โดยแจ้งเตือนไม่เปลี่ยน", () => {
    const [first] = fill(somying, 2, 2);

    const href = openNotification(db, somying, first, at("09:25"));
    expect(openNotification(db, somying, first, at("09:26"))).toBe(href);
    expect(countUnread(db, somying)).toBe(1);
    expect(db.prepare("SELECT read_at FROM notifications WHERE id = ?").get(first)?.read_at).toBe(at("09:25").toISOString());

    const [, other] = [first, first + 1];
    expect(openNotification(db, mana, other, at("09:27"))).toBeNull();
    expect(openNotification(db, somying, 999, at("09:27"))).toBeNull();
    expect(openNotification(db, somying, Number.NaN, at("09:27"))).toBeNull();
    expect(countUnread(db, somying)).toBe(1);
  });
});

describe("NTF-005 อ่านทั้งหมดแล้ว", () => {
  test("NTF-005 ทุกรายการของบัญชีเป็นอ่านแล้ว รวมรายการที่อยู่หน้าอื่น", () => {
    fill(somchai, 45, 0);
    db.prepare("UPDATE notifications SET read_at = NULL WHERE id IN (SELECT id FROM notifications WHERE account_id = ? ORDER BY id LIMIT 6)").run(somchai);
    expect(listNotifications(db, somchai, 3).items.filter((item) => !item.read)).toHaveLength(5);

    expect(markAllRead(db, somchai, at("09:30"))).toBe(6);

    expect(countUnread(db, somchai)).toBe(0);
    expect(markAllRead(db, somchai, at("09:31"))).toBe(0);
  });

  test("NTF-005 แจ้งเตือนที่เกิดหลังกดยังไม่อ่าน และของบัญชีอื่นไม่เปลี่ยน", () => {
    fill(somchai, 6, 6);
    fill(mana, 4, 4);

    markAllRead(db, somchai, at("09:30"));
    note(somchai, at("09:31"), "ร้านของฉัน: คำสั่งซื้อใหม่ 2611260046 ยอด ฿340 รอจัดของ");

    expect(countUnread(db, somchai)).toBe(1);
    expect(countUnread(db, mana)).toBe(4);
  });
});

describe("NTF-014 สิ่งที่หน้าเปิดค้างถาม", () => {
  test("NTF-014 บอกจำนวนที่ยังไม่อ่านและจำนวนที่เกิดหลังรายการล่าสุดที่หน้ารู้ โดยไม่นับของบัญชีอื่น", () => {
    const ids = fill(somying, 3, 2);
    const known = ids.at(-1)!;
    expect(notificationPulse(db, somying, known)).toEqual({ unread: 2, latestId: known, newCount: 0 });

    note(mana, at("10:05"));
    expect(notificationPulse(db, somying, known)).toEqual({ unread: 2, latestId: known, newCount: 0 });

    const fresh = note(somying, at("10:06"));
    note(somying, at("10:07"));
    expect(notificationPulse(db, somying, known)).toEqual({ unread: 4, latestId: fresh + 1, newCount: 2 });
    expect(notificationPulse(db, somying, Number.NaN).newCount).toBe(5);
  });
});

describe("NTF-016 เฉพาะบัญชีที่เกี่ยวข้อง", () => {
  test("NTF-016 เหตุการณ์เดียวกันที่เข้ามาซ้ำได้ 1 รายการต่อผู้รับ แต่ผู้รับคนละคนได้คนละรายการ", () => {
    const input = { type: NOTIFICATION_TYPE.paymentSucceeded, message: "จ่ายเงินสำเร็จ ฿450 สำหรับ 2 คำสั่งซื้อ", href: "/pay/1", eventKey: "payment:1:succeeded" };

    expect(addNotification(db, { ...input, accountId: somying }, at("14:09"))).toBe(true);
    expect(addNotification(db, { ...input, accountId: somying }, at("14:10"))).toBe(false);
    expect(addNotification(db, { ...input, accountId: somchai }, at("14:09"))).toBe(true);

    expect(listNotifications(db, somying).items.map((item) => item.createdAt)).toEqual([at("14:09").toISOString()]);
  });

  test("NTF-016 NTF-Q05 บัญชีอื่นเปิดหรือกดอ่านทั้งหมดแล้ว 20 ครั้ง แจ้งเตือนของเจ้าของไม่เปลี่ยน และไม่เห็นข้อความของบัญชีอื่น", () => {
    const ids = fill(somchai, 6, 6);
    fill(mana, 2, 2);

    for (let n = 0; n < 20; n++) {
      expect(openNotification(db, mana, ids[n % ids.length], at("14:15"))).toBeNull();
      markAllRead(db, mana, at("14:15"));
    }

    expect(countUnread(db, somchai)).toBe(6);
    const own = new Set(listNotifications(db, somchai).items.map((item) => item.id));
    expect(listNotifications(db, mana).items.some((item) => own.has(item.id))).toBe(false);
    expect(latestNotifications(db, mana).items.some((item) => own.has(item.id))).toBe(false);
  });
});

describe("NTF-Q03 ความถูกต้องของจำนวนที่ยังไม่อ่าน", () => {
  test("NTF-Q03 สร้าง เปิดอ่าน และกดอ่านทั้งหมดแล้ว 50 ชุด จำนวนที่นับได้เท่ากับจำนวนรายการที่ยังไม่อ่านทุกครั้ง", () => {
    const unreadInList = () => {
      const pages = listNotifications(db, somying).pageCount;
      return Array.from({ length: pages }, (_, i) => listNotifications(db, somying, i + 1).items).flat().filter((item) => !item.read).length;
    };
    for (let round = 0; round < 50; round++) {
      const ids = Array.from({ length: 1 + (round % 4) }, (_, i) => note(somying, new Date(at("09:00").getTime() + (round * 10 + i) * 1000)));
      note(somchai, at("09:00"));
      if (round % 3 === 0) openNotification(db, somying, ids[0], at("12:00"));
      if (round % 7 === 6) markAllRead(db, somying, at("12:00"));

      expect(countUnread(db, somying)).toBe(unreadInList());
      expect(notificationPulse(db, somying, 0).unread).toBe(unreadInList());
    }
    expect(countUnread(db, somying)).toBeGreaterThan(0);
  });
});
