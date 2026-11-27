// test ระดับหน้า กระดิ่ง และ server action ของแจ้งเตือน ส่วน vi.mock ลอกจาก account-pages.test.tsx

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import NotificationNotFound from "@/app/notifications/[id]/not-found";
import OpenNotificationPage from "@/app/notifications/[id]/page";
import NotificationsError from "@/app/notifications/error";
import NotificationsPage from "@/app/notifications/page";
import { createSession } from "@/features/account/server/sessions";
import { latestNotificationsAction, markAllReadAction, notificationPulseAction } from "@/features/notification/actions";
import { loadBellList } from "@/features/notification/components/bell";
import { saveAllRead } from "@/features/notification/components/mark-all-read";
import { askPulse, createPulsePoller, PULSE_INTERVAL_MS } from "@/features/notification/components/use-pulse";
import { addNotification, countUnread, NOTIFICATION_TYPE, type Pulse } from "@/features/notification/server/notifications";
import type { Db } from "@/shared/db";
import { addAccount } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";
import { SiteHeader } from "@/shared/layout/site-header";
import { SESSION_COOKIE } from "@/shared/session";

const request = vi.hoisted(() => ({
  db: undefined as Db | undefined,
  cookies: new Map<string, string>(),
  Redirected: class Redirected extends Error {
    constructor(readonly url: string) {
      super(`redirect ${url}`);
    }
  },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (request.cookies.has(name) ? { name, value: request.cookies.get(name) } : undefined),
    set: (name: string, value: string) => void request.cookies.set(name, value),
    delete: (name: string) => void request.cookies.delete(name),
  }),
  headers: async () => new Headers(),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: (url: string) => {
    throw new request.Redirected(url);
  },
  notFound: () => {
    throw new request.Redirected("not-found");
  },
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

vi.mock("next/cache", () => ({ refresh: () => {} }));

vi.mock("@/shared/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/db")>()),
  getDb: () => request.db,
}));

let db: Db;
let somying: number;
let somchai: number;
let mana: number;

beforeEach(() => {
  db = createTestDb();
  request.db = db;
  request.cookies.clear();
  somying = addAccount(db, { displayName: "สมหญิง" }).id;
  somchai = addAccount(db, { displayName: "สมชาย" }).id;
  mana = addAccount(db, { displayName: "มานะ" }).id;
});

const signInAs = (accountId: number) => void request.cookies.set(SESSION_COOKIE, createSession(db, accountId));
const signOut = () => request.cookies.clear();

async function open(page: Promise<React.ReactNode | void>): Promise<{ redirect?: string; html?: string }> {
  try {
    return { html: renderToStaticMarkup((await page) ?? null) };
  } catch (error) {
    if (error instanceof request.Redirected) return { redirect: error.url };
    throw error;
  }
}

const header = async () => renderToStaticMarkup(await SiteHeader());
const listPage = (page?: string) => open(NotificationsPage({ params: Promise.resolve({}), searchParams: Promise.resolve(page ? { page } : {}) }));
const openPage = (id: number | string) => open(OpenNotificationPage({ params: Promise.resolve({ id: String(id) }), searchParams: Promise.resolve({}) }));

const START = new Date("2026-11-24T10:00:00+07:00").getTime();
let serial = 0;

/** count รายการ ห่างกันรายการละ 1 นาทีนับจาก 24 พ.ย. 10:00 โดย unread รายการล่าสุดยังไม่อ่าน คืนเลขของรายการจากเก่าไปใหม่ */
function fill(accountId: number, count: number, unread: number): number[] {
  const ids = Array.from({ length: count }, (_, i) => {
    serial++;
    addNotification(
      db,
      { accountId, type: NOTIFICATION_TYPE.parcelStatus, message: `พัสดุของบัญชี ${accountId} รายการ ${serial}`, href: `/track/BS${String(serial).padStart(10, "0")}`, eventKey: `test:${serial}` },
      new Date(START + i * 60_000),
    );
    return Number(db.prepare("SELECT max(id) AS id FROM notifications").get()?.id);
  });
  db.prepare("UPDATE notifications SET read_at = created_at WHERE account_id = ? AND id <= ?").run(accountId, ids[count - unread - 1] ?? 0);
  return ids;
}

/** ถามหนึ่งรอบด้วยรายการล่าสุดที่รู้ค่าเดียว */
const pulse = async (sinceId: number): Promise<Pulse | null> => (await notificationPulseAction([sinceId]))?.[0] ?? null;

const itemCount = (html: string) => html.match(/href="\/notifications\/\d+"/g)?.length ?? 0;

/** กระดิ่งก่อนสคริปต์ทำงาน: ลิงก์ไปหน้าแจ้งเตือนที่มีชื่อ label และตัวเลข badge ต่อท้ายไอคอน */
const bellLink = (label: string, badge: string) =>
  new RegExp(`<a class="header-icon-button" aria-label="${label}" href="/notifications">(?:(?!</a>).)*</svg>${badge && `<span class="cart-count">${badge}</span>`}</a>`);

describe("NTF-001 กระดิ่งและจำนวนที่ยังไม่อ่าน", () => {
  test("NTF-001 บัญชีที่เข้าสู่ระบบเห็นกระดิ่งพร้อมเลขที่ยังไม่อ่าน อยู่ก่อนไอคอนตะกร้า และกดแล้วไปหน้าแจ้งเตือนได้แม้สคริปต์ไม่ทำงาน", async () => {
    fill(somying, 12, 3);
    fill(somchai, 5, 5);
    signInAs(somying);

    const html = await header();

    expect(html).toMatch(bellLink("แจ้งเตือน ยังไม่อ่าน 3 รายการ", "3"));
    expect(html.indexOf('href="/notifications"')).toBeLessThan(html.indexOf('href="/cart"'));
  });

  test("NTF-001 ไม่มีตัวเลขเมื่อเป็น 0 และแสดง 99+ เมื่อมากกว่า 99", async () => {
    signInAs(somying);
    expect(await header()).toMatch(bellLink("แจ้งเตือน", ""));

    fill(somying, 100, 100);
    expect(await header()).toMatch(bellLink("แจ้งเตือน ยังไม่อ่าน 100 รายการ", "99\\+"));
  });

  test("NTF-001 นับไม่สำเร็จ กระดิ่งยังแสดงโดยไม่มีตัวเลขและส่วนอื่นของแถบด้านบนครบ ส่วนคนที่ยังไม่เข้าสู่ระบบไม่เห็นกระดิ่ง", async () => {
    fill(somying, 3, 3);
    signInAs(somying);
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.exec("ALTER TABLE notifications RENAME TO notifications_gone");

    const broken = await header();
    expect(broken).toMatch(bellLink("แจ้งเตือน", ""));
    expect(broken).toContain('href="/cart"');
    expect(broken).toContain("สมหญิง");

    signOut();
    expect(await header()).not.toContain("แจ้งเตือน");
  });
});

describe("NTF-002 รายการล่าสุดเมื่อกดกระดิ่ง", () => {
  test("NTF-002 ได้ 10 รายการล่าสุดของบัญชีที่เข้าสู่ระบบ และการกางรายการไม่ทำให้รายการใดเป็นอ่านแล้ว", async () => {
    const ids = fill(somying, 12, 3);
    fill(somchai, 4, 4);
    signInAs(somying);

    const list = await latestNotificationsAction();

    expect(list?.items.map((item) => item.id)).toEqual(ids.slice(2).reverse());
    expect(list?.items.filter((item) => !item.read)).toHaveLength(3);
    expect(countUnread(db, somying)).toBe(3);
  });

  test("NTF-002 NTF-017 โหลดรายการไม่สำเร็จ เช่นอินเทอร์เน็ตหลุด ได้สถานะที่แสดงข้อความพร้อมปุ่มลองใหม่ ไม่โยน error ทั้งหน้า", async () => {
    expect(await loadBellList(() => Promise.reject(new TypeError("Failed to fetch")))).toBeNull();
    expect(await loadBellList(async () => null)).toBeNull();
    const list = { items: [], unread: 0, latestId: 0, newCount: 0 };
    expect(await loadBellList(async () => list)).toBe(list);
  });
});

describe("NTF-003 หน้าแจ้งเตือน", () => {
  test("NTF-003 หน้าแรกมี 20 รายการล่าสุดกับจำนวนที่ยังไม่อ่าน และหน้า 3 จาก 3 มี 5 รายการที่ปุ่มถัดไปกดไม่ได้", async () => {
    fill(somchai, 45, 6);
    signInAs(somchai);

    const first = (await listPage()).html!;
    expect(itemCount(first)).toBe(20);
    expect(first).toContain("ยังไม่อ่าน 6 รายการ");
    expect(first).toContain("หน้า 1 จาก 3");
    expect(first).toContain('href="/notifications?page=2"');
    expect(first).toMatch(/<button[^>]*disabled=""[^>]*>ก่อนหน้า<\/button>/);

    const last = (await listPage("3")).html!;
    expect(itemCount(last)).toBe(5);
    expect(last).toContain("หน้า 3 จาก 3");
    expect(last).toMatch(/<button[^>]*disabled=""[^>]*>ถัดไป<\/button>/);
    expect(last.lastIndexOf("24 พ.ย. 10:00")).toBeGreaterThan(last.lastIndexOf("24 พ.ย. 10:04"));
  });

  test("NTF-003 ลิงก์ที่ระบุหน้า 9 ได้หน้าสุดท้ายที่มีอยู่จริง และคนที่ยังไม่เข้าสู่ระบบถูกพาไปหน้าเข้าสู่ระบบ", async () => {
    fill(somchai, 45, 0);
    signInAs(somchai);
    const html = (await listPage("9")).html!;
    expect(html).toContain("หน้า 3 จาก 3");
    expect(itemCount(html)).toBe(5);

    signOut();
    expect(await listPage()).toEqual({ redirect: "/login?next=%2Fnotifications" });
  });
});

describe("NTF-004 เปิดแจ้งเตือนแล้วไปหน้าที่เกี่ยวข้อง", () => {
  test("NTF-004 กดแจ้งเตือนแล้วถูกพาไปหน้าที่เกี่ยวข้อง กระดิ่งลดลง 1 และรายการนั้นไม่มีเครื่องหมายยังไม่อ่าน", async () => {
    const ids = fill(somying, 3, 3);
    signInAs(somying);
    expect((await listPage()).html).toContain(`href="/notifications/${ids[2]}"`);

    expect((await openPage(ids[2])).redirect).toMatch(/^\/track\/BS\d{10}$/);

    expect(await header()).toContain("แจ้งเตือน ยังไม่อ่าน 2 รายการ");
    const html = (await listPage()).html!;
    expect(html.match(/ยังไม่อ่าน <\/span>/g)).toHaveLength(2);
  });

  test("NTF-004 กดรายการเดิมจากสองหน้าต่างไปหน้าเดิมทั้งสองครั้งโดยกระดิ่งลดครั้งเดียว และบัญชีอื่นเห็น ไม่พบแจ้งเตือน", async () => {
    const [first] = fill(somying, 2, 2);
    signInAs(somying);

    const target = (await openPage(first)).redirect;
    expect((await openPage(first)).redirect).toBe(target);
    expect(countUnread(db, somying)).toBe(1);

    signInAs(mana);
    expect(await openPage(first + 1)).toEqual({ redirect: "not-found" });
    expect(await openPage("abc")).toEqual({ redirect: "not-found" });
    expect(countUnread(db, somying)).toBe(1);
    expect(renderToStaticMarkup(<NotificationNotFound />)).toContain("ไม่พบแจ้งเตือน");

    signOut();
    expect(await openPage(first)).toEqual({ redirect: `/login?next=%2Fnotifications%2F${first}` });
  });
});

describe("NTF-005 อ่านทั้งหมดแล้ว", () => {
  test("NTF-005 กดแล้วกระดิ่งไม่มีตัวเลข หน้าแจ้งเตือนแสดงยังไม่อ่าน 0 รายการ และปุ่มกดไม่ได้", async () => {
    fill(somchai, 45, 6);
    fill(mana, 3, 3);
    signInAs(somchai);
    expect((await listPage()).html).toMatch(/<button type="submit" class="button button-secondary">อ่านทั้งหมดแล้ว<\/button>/);

    await markAllReadAction();

    expect(await header()).toMatch(bellLink("แจ้งเตือน", ""));
    const html = (await listPage()).html!;
    expect(html).toContain("ยังไม่อ่าน 0 รายการ");
    expect(html).not.toContain("ยังไม่อ่าน </span>");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>อ่านทั้งหมดแล้ว<\/button>/);
    expect(countUnread(db, mana)).toBe(3);
  });

  test("NTF-005 บันทึกไม่สำเร็จ เช่นอินเทอร์เน็ตหลุด ได้ผลว่าไม่สำเร็จและสถานะของแจ้งเตือนไม่เปลี่ยน", async () => {
    fill(somchai, 6, 6);

    expect(await saveAllRead(() => Promise.reject(new TypeError("Failed to fetch")))).toBe(false);
    expect(await saveAllRead(async () => {})).toBe(true);

    expect(countUnread(db, somchai)).toBe(6);
  });

  test("NTF-005 NTF-016 คนที่ออกจากระบบแล้วถูกพาไปหน้าเข้าสู่ระบบ ไม่มีแจ้งเตือนของใครเปลี่ยน", async () => {
    fill(somchai, 6, 6);

    await expect(markAllReadAction()).rejects.toMatchObject({ url: "/login?next=%2Fnotifications" });

    expect(countUnread(db, somchai)).toBe(6);
  });
});

describe("NTF-014 NTF-015 แจ้งเตือนใหม่ขึ้นเองบนหน้าที่เปิดค้างไว้", () => {
  test("NTF-014 หน้าที่เปิดค้างถามทุก 5 วินาที ได้จำนวนที่ยังไม่อ่านและจำนวนรายการใหม่ของบัญชีตัวเองเท่านั้น", async () => {
    const ids = fill(somying, 2, 2);
    signInAs(somying);
    const known = ids[1];
    expect(PULSE_INTERVAL_MS).toBeLessThanOrEqual(5_000);

    fill(mana, 1, 1);
    expect(await pulse(known)).toEqual({ unread: 2, latestId: known, newCount: 0 });

    const [fresh] = fill(somying, 1, 1);
    expect(await pulse(known)).toEqual({ unread: 3, latestId: fresh, newCount: 1 });
  });

  test("NTF-014 อ่านแจ้งเตือนจากหน้าต่างหนึ่ง รอบถามถัดไปของอีกหน้าต่างได้จำนวนที่ลดลง", async () => {
    const ids = fill(somying, 3, 3);
    signInAs(somying);

    await openPage(ids[0]);

    expect((await pulse(ids[2]))?.unread).toBe(2);
  });

  test("NTF-015 รอบที่ถามไม่ได้หรือออกจากระบบแล้วไม่ได้ค่าใหม่และไม่โยน error กระดิ่งจึงแสดงตัวเลขล่าสุดที่รู้ และรอบถัดไปได้จำนวนที่นับใหม่ทั้งหมด", async () => {
    fill(somchai, 1, 1);
    signInAs(somchai);
    const offline = async (): Promise<Pulse[] | null> => {
      throw new TypeError("Failed to fetch");
    };

    expect(await askPulse(offline, [1])).toBeNull();
    fill(somchai, 2, 2);
    expect(await askPulse(offline, [1])).toBeNull();
    expect((await askPulse(notificationPulseAction, [1]))?.[0].unread).toBe(3);
    expect((await askPulse(notificationPulseAction, [1]))?.[0].unread).toBe(3);

    signOut();
    expect(await askPulse(notificationPulseAction, [1])).toBeNull();
    expect(await latestNotificationsAction()).toBeNull();
  });

  test("NTF-014 กระดิ่งกับแถบแจ้งเตือนใหม่ถามในคำขอเดียว แต่ละตัวได้จำนวนรายการใหม่นับจากรายการที่ตัวเองรู้", async () => {
    const ids = fill(somying, 3, 3);
    signInAs(somying);

    expect(await notificationPulseAction([ids[2], ids[0]])).toEqual([
      { unread: 3, latestId: ids[2], newCount: 0 },
      { unread: 3, latestId: ids[2], newCount: 2 },
    ]);
    expect(await notificationPulseAction("x" as never)).toEqual([]);
    expect(await notificationPulseAction(Array.from({ length: 50 }, () => 0))).toHaveLength(4);
  });

  test("NTF-014 การถามเป็นระยะไม่เขียนแถวการเข้าสู่ระบบ จึงไม่ต่ออายุ 30 วัน และการเข้าสู่ระบบที่หมดอายุหรือบัญชีที่ถูกระงับไม่ได้ค่า", async () => {
    fill(somying, 1, 1);
    signInAs(somying);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    db.prepare("UPDATE sessions SET last_used_at = ?, expires_at = ?").run("2026-01-01T00:00:00.000Z", tomorrow);

    expect((await pulse(0))?.unread).toBe(1);
    expect((await pulse(0))?.unread).toBe(1);
    expect(db.prepare("SELECT last_used_at, expires_at FROM sessions").get()).toEqual({ last_used_at: "2026-01-01T00:00:00.000Z", expires_at: tomorrow });

    db.prepare("UPDATE sessions SET expires_at = ?").run("2026-01-02T00:00:00.000Z");
    expect(await pulse(0)).toBeNull();
    db.prepare("UPDATE sessions SET expires_at = ?").run(tomorrow);
    db.prepare("UPDATE accounts SET status = 'ถูกระงับ' WHERE id = ?").run(somying);
    expect(await pulse(0)).toBeNull();
  });

  describe("รอบถามของหน้าที่เปิดค้าง", () => {
    const answer = (sinceIds: number[]) => sinceIds.map((sinceId) => ({ unread: 1, latestId: 9, newCount: 9 - sinceId }));
    /** หน้าเว็บจำลองที่ซ่อนและแสดงแท็บได้ */
    function fakePage() {
      const listeners = new Set<() => void>();
      const page = {
        hidden: false,
        addEventListener: (_type: string, listener: () => void) => void listeners.add(listener),
        removeEventListener: (_type: string, listener: () => void) => void listeners.delete(listener),
        show(visible: boolean) {
          page.hidden = !visible;
          for (const listener of listeners) listener();
        },
        listeners,
      };
      return page;
    }

    beforeEach(() => void vi.useFakeTimers());
    afterEach(() => void vi.useRealTimers());

    test("NTF-014 component สองตัวบนหน้าเดียวใช้รอบถามเดียวกัน รอบละหนึ่งคำขอ ตอนเปิดหน้าและทุก 5 วินาที", async () => {
      const ask = vi.fn(async (sinceIds: number[]) => answer(sinceIds));
      const poller = createPulsePoller(ask, fakePage());
      const bell = vi.fn();
      const banner = vi.fn();
      const stopBell = poller.subscribe({ sinceId: () => 7, onPulse: bell });
      const stopBanner = poller.subscribe({ sinceId: () => 4, onPulse: banner });
      poller.askSoon();

      await vi.advanceTimersByTimeAsync(0);
      expect(ask.mock.calls).toEqual([[[7, 4]]]);
      expect(bell).toHaveBeenLastCalledWith({ unread: 1, latestId: 9, newCount: 2 });
      expect(banner).toHaveBeenLastCalledWith({ unread: 1, latestId: 9, newCount: 5 });

      await vi.advanceTimersByTimeAsync(PULSE_INTERVAL_MS * 2);
      expect(ask).toHaveBeenCalledTimes(3);

      stopBanner();
      await vi.advanceTimersByTimeAsync(PULSE_INTERVAL_MS);
      expect(ask.mock.lastCall).toEqual([[7]]);
      expect(banner).toHaveBeenCalledTimes(3);

      stopBell();
      await vi.advanceTimersByTimeAsync(PULSE_INTERVAL_MS * 3);
      expect(ask).toHaveBeenCalledTimes(4);
    });

    test("NTF-014 แท็บที่ถูกซ่อนไม่ถามเซิร์ฟเวอร์ กลับมาแสดงแล้วถามทันทีหนึ่งครั้งและถามต่อทุก 5 วินาที", async () => {
      const ask = vi.fn(async (sinceIds: number[]) => answer(sinceIds));
      const page = fakePage();
      const poller = createPulsePoller(ask, page);
      const stop = poller.subscribe({ sinceId: () => 0, onPulse: () => {} });
      await vi.advanceTimersByTimeAsync(0);
      expect(ask).toHaveBeenCalledTimes(1);

      page.show(false);
      await vi.advanceTimersByTimeAsync(PULSE_INTERVAL_MS * 6);
      expect(ask).toHaveBeenCalledTimes(1);

      page.show(true);
      await vi.advanceTimersByTimeAsync(0);
      expect(ask).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(PULSE_INTERVAL_MS);
      expect(ask).toHaveBeenCalledTimes(3);

      stop();
      expect(page.listeners.size).toBe(0);
    });

    test("NTF-015 รอบที่ถามไม่ได้ไม่เรียก component และรอบถัดไปยังถามต่อ", async () => {
      const ask = vi.fn(async (sinceIds: number[]): Promise<Pulse[] | null> => answer(sinceIds));
      ask.mockRejectedValueOnce(new TypeError("Failed to fetch"));
      const onPulse = vi.fn();
      const stop = createPulsePoller(ask, fakePage()).subscribe({ sinceId: () => 0, onPulse });
      await vi.advanceTimersByTimeAsync(0);
      expect(onPulse).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(PULSE_INTERVAL_MS);
      expect(onPulse).toHaveBeenCalledTimes(1);
      stop();
    });
  });

  test("NTF-015 แจ้งเตือนที่เกิดระหว่างออกจากระบบแสดงครบตั้งแต่หน้าแรกที่โหลด โดยไม่ต้องมีสคริปต์", async () => {
    fill(somying, 1, 1);
    fill(somying, 3, 3);
    signInAs(somying);

    expect(await header()).toMatch(bellLink("แจ้งเตือน ยังไม่อ่าน 4 รายการ", "4"));
    expect(itemCount((await listPage()).html!)).toBe(4);
  });
});

describe("NTF-016 เฉพาะบัญชีที่เกี่ยวข้อง", () => {
  test("NTF-016 NTF-Q05 ผู้ขายอีกร้านส่งคำขอเปิดและอ่านทั้งหมดแล้ว แจ้งเตือนของเจ้าของไม่เปลี่ยน และไม่เห็นข้อความของบัญชีอื่น", async () => {
    const ids = fill(somchai, 6, 6);
    fill(mana, 2, 2);
    signInAs(mana);

    for (const id of ids) expect(await openPage(id)).toEqual({ redirect: "not-found" });
    await markAllReadAction();

    expect(countUnread(db, somchai)).toBe(6);
    const html = (await listPage()).html!;
    expect(html).toContain(`พัสดุของบัญชี ${mana} `);
    expect(html).not.toContain(`พัสดุของบัญชี ${somchai} `);
    expect((await latestNotificationsAction())?.items.every((item) => item.message.includes(`บัญชี ${mana} `))).toBe(true);
    expect(await pulse(0)).toMatchObject({ unread: 0, newCount: 2 });
  });
});

describe("NTF-017 หน้าว่าง หน้ากำลังโหลด และหน้าผิดพลาด", () => {
  test("NTF-017 บัญชีที่ไม่มีแจ้งเตือนเห็น ยังไม่มีแจ้งเตือน ไม่มีเลขหน้า และปุ่มอ่านทั้งหมดแล้วกดไม่ได้", async () => {
    const wichai = addAccount(db, { displayName: "วิชัย", isAdmin: true }).id;
    signInAs(wichai);

    const html = (await listPage()).html!;

    expect(html).toContain("ยังไม่มีแจ้งเตือน");
    expect(html).not.toMatch(/หน้า \d+ จาก/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>อ่านทั้งหมดแล้ว<\/button>/);
    expect(await header()).toMatch(bellLink("แจ้งเตือน", ""));
  });

  test("NTF-017 โหลดหน้าแจ้งเตือนไม่สำเร็จ เห็นข้อความพร้อมปุ่มลองใหม่", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToStaticMarkup(<NotificationsError error={new Error("offline")} retry={() => {}} />);

    expect(html).toContain("โหลดแจ้งเตือนไม่สำเร็จ");
    expect(html).toContain("ลองใหม่");
  });
});

describe("ไฟล์ที่ไปอยู่ในเบราว์เซอร์", () => {
  test("component ของแจ้งเตือนและหน้าผิดพลาดไม่ import ค่าจากโมดูลใน server/ ใช้ได้แค่ชนิดข้อมูล", () => {
    const dir = join(process.cwd(), "src/features/notification/components");
    const files = [...readdirSync(dir).filter((name) => /\.tsx?$/.test(name)).map((name) => join(dir, name)), join(process.cwd(), "src/app/notifications/error.tsx")];
    const values = files.flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+"[^"]*\/server\/[^"]*"/g)]
        .filter((match) => !match[1])
        .flatMap((match) => match[2].split(",").map((name) => name.trim()).filter((name) => name && !name.startsWith("type ")))
        .map((name) => `${file.split("/").pop()}: ${name}`),
    );
    expect(values).toEqual([]);
  });
});
