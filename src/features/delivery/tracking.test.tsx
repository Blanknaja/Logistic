// test ของกฎใน server/ และของหน้าติดตามพัสดุกับหน้าค้นหาพัสดุ
// ส่วน vi.mock ลอกจาก src/features/account/account-pages.test.tsx

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import TrackingPage from "@/app/track/[trackingNo]/page";
import TrackingLoading from "@/app/track/[trackingNo]/loading";
import ParcelNotFound from "@/app/track/[trackingNo]/not-found";
import TrackingError from "@/app/track/error";
import TrackSearchPage from "@/app/track/page";
import { createSession } from "@/features/account/server/sessions";
import { LOADING_TIMEOUT_MS } from "@/shared/ui/loading-timeout";
import { SAVE_FAILED } from "@/features/delivery/components/confirm-receipt";
import { MAP_TIMEOUT_MS } from "@/features/delivery/components/delivery-map";
import { nav } from "@/features/delivery/nav";
import { confirmReceiptAction } from "@/features/delivery/receipt-actions";
import {
  completeDueReceipts,
  confirmReceipt,
  RECEIPT_ERROR,
  startReceiptAutoCompletion,
} from "@/features/delivery/server/receipt";
import { getTrackingView, PARCEL_NOT_FOUND, searchParcel, TRACKING_NO_FORMAT_ERROR } from "@/features/delivery/server/tracking";
import { writeParcel, type HistoryEntry } from "@/features/delivery/server/tracking-fixtures";
import type { Db } from "@/shared/db";
import { addAccount, addOrder, addProduct, addShop } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";
import { SESSION_COOKIE } from "@/shared/session";
import { ORDER_STATUS, PARCEL_STATUS, RECEIPT_CONFIRMED_BY, type OrderStatus } from "@/shared/statuses";

const request = vi.hoisted(() => ({
  db: undefined as Db | undefined,
  cookies: new Map<string, string>(),
  refreshed: 0,
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
  useRouter: () => ({ refresh: () => {} }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  refresh: () => {
    request.refreshed++;
  },
}));

vi.mock("@/shared/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/db")>()),
  getDb: () => request.db,
}));

/** เวลาไทย "2026-11-25T09:00" → ISO แบบ UTC ที่เก็บในฐานข้อมูล */
const thai = (local: string) => new Date(`${local}+07:00`).toISOString();

const DELIVERED_HISTORY: HistoryEntry[] = [
  { status: PARCEL_STATUS.awaitingPacking, at: thai("2026-11-25T09:00"), location: "สมชายการช่าง" },
  { status: PARCEL_STATUS.handedOver, at: thai("2026-11-25T10:00"), location: "จุดรับพัสดุบางนา" },
  { status: PARCEL_STATUS.inTransit, at: thai("2026-11-25T13:20"), location: "ศูนย์คัดแยกลาดกระบัง" },
  { status: PARCEL_STATUS.outForDelivery, at: thai("2026-11-26T14:01"), location: "ศูนย์กระจายพัสดุอ่อนนุช" },
  { status: PARCEL_STATUS.delivered, at: thai("2026-11-26T15:30"), location: "บ้านเลขที่ 12 ซอยอ่อนนุช 17" },
];

let db: Db;
let people: ReturnType<typeof setup>;

function setup(db: Db) {
  const somchai = addAccount(db, { displayName: "สมชาย" });
  const somchaiShop = addShop(db, { ownerAccountId: somchai.id, name: "สมชายการช่าง" });
  const mana = addAccount(db, { displayName: "มานะ" });
  const manaShop = addShop(db, { ownerAccountId: mana.id, name: "มานะสปอร์ต" });
  const somying = addAccount(db, { displayName: "สมหญิง" });
  const otherBuyer = addAccount(db, { displayName: "ผู้ซื้ออื่น" });
  const wichai = addAccount(db, { displayName: "วิชัย", isAdmin: true });
  const hammer = addProduct(db, { shopId: somchaiShop.id, name: "ค้อน", price: 150 });
  return {
    hammerVariantId: hammer.variantIds[0],
    somchai: { id: somchai.id, isAdmin: false, shopId: somchaiShop.id },
    mana: { id: mana.id, isAdmin: false, shopId: manaShop.id },
    somying: { id: somying.id, isAdmin: false, shopId: null },
    otherBuyer: { id: otherBuyer.id, isAdmin: false, shopId: null },
    wichai: { id: wichai.id, isAdmin: true, shopId: null },
  };
}

function addTrackedParcel(input: {
  trackingNo?: string;
  buyerId?: number;
  orderStatus?: OrderStatus;
  history?: HistoryEntry[];
  receiverName?: string;
  failureReason?: string;
}) {
  const order = addOrder(db, {
    buyerAccountId: input.buyerId ?? people.somying.id,
    items: [{ variantId: people.hammerVariantId, quantity: 2 }],
    status: input.orderStatus ?? ORDER_STATUS.shipping,
  });
  const history = input.history ?? DELIVERED_HISTORY;
  const delivered = history.at(-1)?.status === PARCEL_STATUS.delivered;
  writeParcel(db, {
    orderId: order.id,
    trackingNo: input.trackingNo ?? "BS0000000123",
    history,
    receiverName: input.receiverName ?? (delivered ? "สมหญิง ใจดี" : undefined),
    failureReason: input.failureReason,
  });
  return order;
}

const orderRow = (orderId: number) =>
  db.prepare("SELECT status, completed_at FROM orders WHERE id = ?").get(orderId) as { status: string; completed_at: string | null };

beforeEach(() => {
  db = createTestDb();
  people = setup(db);
  request.db = db;
  request.cookies.clear();
  request.refreshed = 0;
  // วันที่บนหน้าไม่มีปีเมื่อเป็นปีนี้ จึงกำหนดวันนี้เอง ผลไม่เปลี่ยนเมื่อขึ้นปีใหม่
  vi.useFakeTimers({ now: new Date(thai("2026-11-26T16:00")), toFake: ["Date"] });
});

/** ให้เครื่องนี้เข้าสู่ระบบเป็นบัญชีนี้ */
function signInAs(accountId: number) {
  request.cookies.set(SESSION_COOKIE, createSession(db, accountId));
}

/** ผลของการเปิดหน้าหรือกดปุ่ม: ที่อยู่ที่ถูกพาไป หรือ HTML และค่าที่ได้ */
async function run<T>(work: Promise<T>): Promise<{ redirect?: string; value?: T }> {
  try {
    return { value: await work };
  } catch (error) {
    if (error instanceof request.Redirected) return { redirect: error.url };
    throw error;
  }
}

const openTracking = async (trackingNo = "BS0000000123") => {
  const result = await run(TrackingPage({ params: Promise.resolve({ trackingNo }), searchParams: Promise.resolve({}) }));
  return { redirect: result.redirect, html: result.value ? renderToStaticMarkup(result.value) : undefined };
};

const openSearch = async (searchParams: Record<string, string> = {}) => {
  const result = await run(TrackSearchPage({ params: Promise.resolve({}), searchParams: Promise.resolve(searchParams) }));
  return { redirect: result.redirect, html: result.value ? renderToStaticMarkup(result.value) : undefined };
};

const pressConfirm = (trackingNo = "BS0000000123") => {
  const data = new FormData();
  data.set("trackingNo", trackingNo);
  return run(confirmReceiptAction(data));
};

/** ข้อความในหน้าโดยไม่มีแท็ก */
const textOf = (html = "") => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

/** ข้อความของหัวเรื่องหลัก */
const headingOf = (html = "") => textOf(html.match(/<h1[^>]*>([^]*?)<\/h1>/)?.[1]).trim();

afterEach(() => {
  vi.useRealTimers();
});

describe("DLV-010 หน้าติดตามพัสดุ", () => {
  test("DLV-010 ผู้ซื้อเห็นสถานะปัจจุบันและประวัติ 5 รายการ เรียงจากใหม่ไปเก่า พร้อมชื่อผู้รับ", () => {
    addTrackedParcel({});
    const view = getTrackingView(db, "BS0000000123", people.somying);

    expect(view).toMatchObject({
      trackingNo: "BS0000000123",
      shopName: "สมชายการช่าง",
      parcelStatus: PARCEL_STATUS.delivered,
      orderStatus: ORDER_STATUS.shipping,
      origin: null,
      canChangeStatus: false,
    });
    expect(view?.history).toHaveLength(5);
    expect(view?.history[0]).toEqual({
      status: PARCEL_STATUS.delivered,
      at: thai("2026-11-26T15:30"),
      location: "บ้านเลขที่ 12 ซอยอ่อนนุช 17",
      province: null,
      receiverName: "สมหญิง ใจดี",
      failureReason: null,
      changedBy: null,
    });
    expect(view?.history[4]).toMatchObject({
      status: PARCEL_STATUS.awaitingPacking,
      at: thai("2026-11-25T09:00"),
      location: "สมชายการช่าง",
      receiverName: null,
    });
  });

  test("DLV-010 ผู้ขายเจ้าของร้านและผู้ดูแลแพลตฟอร์มเห็นที่อยู่ต้นทาง คนเปลี่ยน และสิทธิ์เปลี่ยนสถานะ", () => {
    addTrackedParcel({
      history: [
        DELIVERED_HISTORY[0],
        { status: PARCEL_STATUS.handedOver, at: thai("2026-11-25T10:00"), location: "จุดรับพัสดุบางนา", byAccountId: people.somchai.id },
      ],
    });

    for (const staff of [people.somchai, people.wichai]) {
      const view = getTrackingView(db, "BS0000000123", staff);
      expect(view?.canChangeStatus).toBe(true);
      expect(view?.origin?.address).toBe("99/1 ถนนตัวอย่าง");
      expect(view?.history[0].changedBy).toBe("สมชาย");
    }
  });

  test("DLV-010 รายการ ส่งไม่สำเร็จ มีเหตุผล", () => {
    addTrackedParcel({
      orderStatus: ORDER_STATUS.cancelled,
      history: [
        ...DELIVERED_HISTORY.slice(0, 4),
        { status: PARCEL_STATUS.failed, at: thai("2026-11-26T16:00"), location: "หน้าบ้านผู้ซื้อ ซอยอ่อนนุช 17" },
      ],
      failureReason: "ไม่มีคนรับ โทรไม่ติด 2 ครั้ง",
    });
    const view = getTrackingView(db, "BS0000000123", people.somying);

    expect(view?.history[0]).toMatchObject({ status: PARCEL_STATUS.failed, failureReason: "ไม่มีคนรับ โทรไม่ติด 2 ครั้ง" });
    expect(view?.history[1].failureReason).toBeNull();
  });

  test("DLV-010 ผู้ขายร้านอื่นและผู้ซื้อคนอื่นไม่เห็นข้อมูลใดของพัสดุ เหมือนพัสดุที่ไม่มีอยู่", () => {
    addTrackedParcel({});

    expect(getTrackingView(db, "BS0000000123", people.mana)).toBeNull();
    expect(getTrackingView(db, "BS0000000123", people.otherBuyer)).toBeNull();
    expect(getTrackingView(db, "BS0000000124", people.somying)).toBeNull();
    expect(getTrackingView(db, "ไม่ใช่เลข", people.wichai)).toBeNull();
  });
});

describe("DLV-011 ค้นหาพัสดุด้วยเลขติดตามพัสดุ", () => {
  test("DLV-011 ผู้ดูแลแพลตฟอร์มพิมพ์ตัวเล็กมีช่องว่างท้าย ได้เลขที่ตัดช่องว่างและเป็นตัวใหญ่", () => {
    addTrackedParcel({});
    expect(searchParcel(db, "bs0000000123 ", people.wichai)).toEqual({ ok: true, trackingNo: "BS0000000123" });
  });

  test("DLV-011 พัสดุของคนอื่นได้ ไม่พบพัสดุนี้ เหมือนเลขที่ไม่มี และรูปแบบผิดได้ข้อความรูปแบบ", () => {
    addTrackedParcel({ trackingNo: "BS0000000999", buyerId: people.otherBuyer.id });
    addTrackedParcel({ trackingNo: "BS0000000123" });

    expect(searchParcel(db, "BS0000000999", people.somying)).toEqual({ ok: false, error: PARCEL_NOT_FOUND });
    expect(searchParcel(db, "BS0000000998", people.somying)).toEqual({ ok: false, error: PARCEL_NOT_FOUND });
    expect(searchParcel(db, "BS12", people.somying)).toEqual({ ok: false, error: TRACKING_NO_FORMAT_ERROR });
    expect(searchParcel(db, "", people.somying)).toEqual({ ok: false, error: TRACKING_NO_FORMAT_ERROR });
    expect(PARCEL_NOT_FOUND).toBe("ไม่พบพัสดุนี้");
    expect(TRACKING_NO_FORMAT_ERROR).toBe("เลขติดตามพัสดุต้องเป็น BS ตามด้วยตัวเลข 10 หลัก");
  });
});

describe("DLV-012 ผู้ซื้อกด ได้รับสินค้าแล้ว", () => {
  test("DLV-012 พัสดุ ส่งสำเร็จ ผู้ซื้อยืนยันแล้วคำสั่งซื้อเป็น สำเร็จ และปุ่มหายไป", () => {
    const order = addTrackedParcel({});
    expect(getTrackingView(db, "BS0000000123", people.somying)?.canConfirmReceipt).toBe(true);

    expect(confirmReceipt(db, "BS0000000123", people.somying, new Date(thai("2026-11-26T18:00")))).toEqual({ ok: true });

    expect(orderRow(order.id)).toEqual({ status: ORDER_STATUS.completed, completed_at: thai("2026-11-26T18:00") });
    const view = getTrackingView(db, "BS0000000123", people.somying);
    expect(view?.receipt).toEqual({ by: RECEIPT_CONFIRMED_BY.buyer, at: thai("2026-11-26T18:00") });
    expect(view?.canConfirmReceipt).toBe(false);
    expect(view?.autoConfirmAt).toBeNull();
  });

  test("DLV-012 ยังไม่ส่งสำเร็จ กดซ้ำ และคนอื่นกดแทน ถูกปฏิเสธโดยไม่มีอะไรเปลี่ยน", () => {
    const outForDelivery = addTrackedParcel({ trackingNo: "BS0000000456", history: DELIVERED_HISTORY.slice(0, 4) });
    const delivered = addTrackedParcel({ trackingNo: "BS0000000123" });
    confirmReceipt(db, "BS0000000123", people.somying, new Date(thai("2026-11-26T18:00")));

    expect(confirmReceipt(db, "BS0000000456", people.somying, new Date(thai("2026-11-26T18:05")))).toEqual({
      ok: false,
      error: "กดได้หลังพัสดุเป็น ส่งสำเร็จ",
    });
    expect(orderRow(outForDelivery.id).status).toBe(ORDER_STATUS.shipping);
    expect(getTrackingView(db, "BS0000000456", people.somying)?.canConfirmReceipt).toBe(false);

    expect(confirmReceipt(db, "BS0000000123", people.somying, new Date(thai("2026-11-26T18:06")))).toEqual({
      ok: false,
      error: "คำสั่งซื้อนี้สำเร็จแล้ว",
    });
    expect(orderRow(delivered.id).completed_at).toBe(thai("2026-11-26T18:00"));

    const waiting = addTrackedParcel({ trackingNo: "BS0000000789" });
    for (const staff of [people.somchai, people.wichai]) {
      expect(confirmReceipt(db, "BS0000000789", staff, new Date(thai("2026-11-26T18:07")))).toEqual({
        ok: false,
        error: RECEIPT_ERROR.buyerOnly,
      });
      expect(getTrackingView(db, "BS0000000789", staff)?.canConfirmReceipt).toBe(false);
    }
    expect(confirmReceipt(db, "BS0000000789", people.otherBuyer)).toEqual({ ok: false, error: PARCEL_NOT_FOUND });
    expect(orderRow(waiting.id).status).toBe(ORDER_STATUS.shipping);
    expect(RECEIPT_ERROR.buyerOnly).toBe("เฉพาะผู้ซื้อกดได้");
  });
});

describe("DLV-013 ปิดคำสั่งซื้ออัตโนมัติเมื่อครบ 7 วัน", () => {
  test("DLV-013 ครบ 168 ชั่วโมงหลัง ส่งสำเร็จ ระบบยืนยันให้ ก่อนหน้านั้นบอกวันที่จะยืนยันให้", () => {
    const order = addTrackedParcel({});
    expect(getTrackingView(db, "BS0000000123", people.somying)?.autoConfirmAt).toBe(thai("2026-12-03T15:30"));

    expect(completeDueReceipts(db, new Date(thai("2026-12-03T15:29")))).toBe(0);
    expect(orderRow(order.id).status).toBe(ORDER_STATUS.shipping);

    expect(completeDueReceipts(db, new Date(thai("2026-12-03T15:30")))).toBe(1);
    expect(orderRow(order.id)).toEqual({ status: ORDER_STATUS.completed, completed_at: thai("2026-12-03T15:30") });
    expect(getTrackingView(db, "BS0000000123", people.somying)?.receipt).toEqual({
      by: RECEIPT_CONFIRMED_BY.system,
      at: thai("2026-12-03T15:30"),
    });
  });

  test("DLV-013 ผู้ซื้อยืนยันไปแล้ว ระบบไม่ยืนยันซ้ำ และถ้าระบบยืนยันก่อน ผู้ซื้อกดซ้ำไม่ได้", () => {
    const confirmedByBuyer = addTrackedParcel({ trackingNo: "BS0000000123" });
    confirmReceipt(db, "BS0000000123", people.somying, new Date(thai("2026-11-26T18:00")));
    const raced = addTrackedParcel({ trackingNo: "BS0000000124" });

    const due = new Date(thai("2026-12-03T15:30"));
    expect(completeDueReceipts(db, due)).toBe(1);
    expect(confirmReceipt(db, "BS0000000124", people.somying, due)).toEqual({ ok: false, error: "คำสั่งซื้อนี้สำเร็จแล้ว" });

    expect(orderRow(confirmedByBuyer.id).completed_at).toBe(thai("2026-11-26T18:00"));
    expect(getTrackingView(db, "BS0000000123", people.somying)?.receipt).toEqual({
      by: RECEIPT_CONFIRMED_BY.buyer,
      at: thai("2026-11-26T18:00"),
    });
    expect(orderRow(raced.id).status).toBe(ORDER_STATUS.completed);
    expect(getTrackingView(db, "BS0000000124", people.somying)?.receipt?.by).toBe(RECEIPT_CONFIRMED_BY.system);
  });

  test("DLV-013 คำสั่งซื้อที่ไม่ได้ กำลังจัดส่ง หรือพัสดุยังไม่ ส่งสำเร็จ ไม่ถูกปิด", () => {
    const cancelled = addTrackedParcel({ trackingNo: "BS0000000201", orderStatus: ORDER_STATUS.cancelled });
    const notDelivered = addTrackedParcel({ trackingNo: "BS0000000202", history: DELIVERED_HISTORY.slice(0, 4) });

    expect(completeDueReceipts(db, new Date(thai("2026-12-31T00:00")))).toBe(0);
    expect(orderRow(cancelled.id).status).toBe(ORDER_STATUS.cancelled);
    expect(orderRow(notDelivered.id).status).toBe(ORDER_STATUS.shipping);
  });
});

describe("DLV-Q03 ความตรงเวลาของการปิดคำสั่งซื้ออัตโนมัติ", () => {
  const addHundred = () =>
    Array.from({ length: 100 }, (_, i) => addTrackedParcel({ trackingNo: `BS${String(1000 + i).padStart(10, "0")}` }).id);
  const shippingCount = (ids: number[]) => ids.filter((id) => orderRow(id).status === ORDER_STATUS.shipping).length;

  test("DLV-Q03 ระบบเปิดอยู่ตอนครบกำหนด ทั้ง 100 คำสั่งซื้อเป็น สำเร็จ ภายใน 5 นาที โดยไม่มีใครเปิดหน้า", () => {
    const ids = addHundred();
    vi.useFakeTimers({ now: new Date(thai("2026-12-03T15:29")) });
    const stop = startReceiptAutoCompletion(db);

    expect(shippingCount(ids)).toBe(100);
    vi.advanceTimersByTime(6 * 60 * 1000);
    expect(shippingCount(ids)).toBe(0);
    stop();
  });

  test("DLV-013 เรียกเริ่มรอบตรวจซ้ำ ไม่เปิดรอบตรวจซ้อน", () => {
    vi.useFakeTimers({ now: new Date(thai("2026-12-03T15:29")) });
    const stop = startReceiptAutoCompletion(db);
    startReceiptAutoCompletion(db);

    expect(vi.getTimerCount()).toBe(1);
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  test("DLV-Q03 ระบบปิดอยู่ตอนครบกำหนด เปิดกลับมาเวลา 16:00 ก็ปิดครบ 100 รายการทันที", () => {
    const ids = addHundred();
    vi.useFakeTimers({ now: new Date(thai("2026-12-03T16:00")) });
    const stop = startReceiptAutoCompletion(db);

    expect(shippingCount(ids)).toBe(0);
    stop();
  });
});

describe("DLV-Q01 ความเร็วของหน้าติดตามพัสดุ", () => {
  test("DLV-Q01 มีพัสดุ 500 ชิ้น เปิดข้อมูลหน้าติดตามพัสดุ 100 ครั้ง อย่างน้อย 95 ครั้งเสร็จใน 2 วินาที", () => {
    for (let i = 0; i < 500; i++) addTrackedParcel({ trackingNo: `BS${String(5000 + i).padStart(10, "0")}` });

    const durations = Array.from({ length: 100 }, () => {
      const started = performance.now();
      expect(getTrackingView(db, "BS0000005123", people.somying)?.history).toHaveLength(5);
      expect(searchParcel(db, "BS0000005123", people.somying).ok).toBe(true);
      return performance.now() - started;
    }).sort((a, b) => a - b);

    expect(durations[94]).toBeLessThan(2000);
  });
});

describe("DLV-010 หน้าติดตามพัสดุ ผ่านหน้าเว็บ", () => {
  test("DLV-010 ผู้ซื้อเห็นสถานะ ประวัติใหม่ไปเก่า เวลาไทย และชื่อผู้รับ แต่ไม่เห็นปุ่มเปลี่ยนสถานะและที่อยู่ต้นทาง", async () => {
    addTrackedParcel({});
    signInAs(people.somying.id);
    const { html } = await openTracking();
    const text = textOf(html);

    expect(headingOf(html)).toBe("ติดตามพัสดุ BS0000000123 ส่งสำเร็จ");
    expect(text).toContain("ร้าน สมชายการช่าง");
    expect(text).toContain("ส่งสำเร็จ 26 พ.ย. 15:30 · บ้านเลขที่ 12 ซอยอ่อนนุช 17 ผู้รับ สมหญิง ใจดี");
    expect(text).toContain("รอร้านจัดของ 25 พ.ย. 09:00 · สมชายการช่าง");
    expect(text.indexOf("26 พ.ย. 15:30")).toBeLessThan(text.indexOf("25 พ.ย. 09:00"));
    expect(html).toContain(`<time dateTime="${thai("2026-11-26T15:30")}">26 พ.ย. 15:30</time>`);
    expect(text).not.toContain("ร้านกำลังเตรียมของ");
    expect(text).not.toContain("ที่อยู่ต้นทาง");
    expect(text).not.toContain("เปลี่ยนเป็น");
    expect(text).not.toContain("เปลี่ยนโดย");
  });

  test("DLV-010 หัวเรื่องคือสถานะการจัดส่ง ถัดมาคือปุ่มได้รับสินค้าแล้วกับวันที่ระบบจะยืนยันให้ แล้วจึงเป็นแผนที่และประวัติ", async () => {
    addTrackedParcel({});
    signInAs(people.somying.id);
    const { html = "" } = await openTracking();

    const order = ["<h1", "ได้รับสินค้าแล้ว", "ถ้าไม่กดยืนยัน", "data-delivery-map", "ประวัติการจัดส่ง"].map((part) => html.indexOf(part));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // ปุ่มสีเน้นมีปุ่มเดียวนอกหน้าต่างถามยืนยัน
    expect(html.replace(/<dialog[^]*<\/dialog>/, "").match(/class="button"/g)).toHaveLength(1);
  });

  test("DLV-010 สถานะคำสั่งซื้อแสดงเฉพาะตอนที่บอกเรื่องที่สถานะการจัดส่งไม่ได้บอก จึงไม่มีสองสถานะที่อ่านแล้วขัดกัน", async () => {
    addTrackedParcel({ trackingNo: "BS0000000301", history: DELIVERED_HISTORY.slice(0, 3) });
    addTrackedParcel({ trackingNo: "BS0000000302" });
    addTrackedParcel({ trackingNo: "BS0000000303", orderStatus: ORDER_STATUS.paid, history: DELIVERED_HISTORY.slice(0, 1) });
    signInAs(people.somying.id);

    // จ่ายแล้ว คู่กับ รอร้านจัดของ และ กำลังจัดส่ง คู่กับพัสดุที่กำลังเดินทางหรือส่งสำเร็จ ไม่บอกอะไรเพิ่ม
    for (const trackingNo of ["BS0000000301", "BS0000000302", "BS0000000303"]) {
      const text = textOf((await openTracking(trackingNo)).html);
      expect(text).not.toContain("สถานะคำสั่งซื้อ");
      expect(text).not.toContain(ORDER_STATUS.shipping);
      expect(text).not.toContain(ORDER_STATUS.paid);
    }
    // ส่งสำเร็จแต่ผู้ซื้อยังไม่ยืนยัน บอกด้วยปุ่มกับวันที่ระบบจะยืนยันให้แทน
    expect(textOf((await openTracking("BS0000000302")).html)).toContain("ถ้าไม่กดยืนยัน");
  });

  test("DLV-010 พัสดุที่เพิ่งสร้างแสดงประวัติ 1 รายการพร้อมข้อความร้านกำลังเตรียมของ", async () => {
    addTrackedParcel({ orderStatus: ORDER_STATUS.paid, history: DELIVERED_HISTORY.slice(0, 1) });
    signInAs(people.somying.id);
    const text = textOf((await openTracking()).html);

    expect(text).toContain("รอร้านจัดของ 25 พ.ย. 09:00 · สมชายการช่าง");
    expect(text).toContain("ร้านกำลังเตรียมของ ยังไม่มีความเคลื่อนไหวอื่น");
    expect(text).not.toContain("ได้รับสินค้าแล้ว");
  });

  test("DLV-010 ผู้ขายเจ้าของร้านเห็นที่อยู่ต้นทางและปุ่มเปลี่ยนสถานะขั้นถัดไป", async () => {
    addTrackedParcel({ history: DELIVERED_HISTORY.slice(0, 1) });
    signInAs(people.somchai.id);
    const { html } = await openTracking();

    expect(html).toContain('data-seam="parcel-status-controls"');
    expect(html).toContain('href="/parcels/BS0000000123?to=');
    expect(textOf(html)).toContain("เปลี่ยนเป็น ร้านส่งของแล้ว");
    expect(textOf(html)).toContain("ที่อยู่ต้นทาง");
    expect(textOf(html)).toContain("99/1 ถนนตัวอย่าง");
  });

  test("DLV-010 คำสั่งซื้อที่ถูกยกเลิกแสดงคำว่า คำสั่งซื้อถูกยกเลิก พร้อมประวัติเดิมและเหตุผล", async () => {
    addTrackedParcel({
      orderStatus: ORDER_STATUS.cancelled,
      history: [
        ...DELIVERED_HISTORY.slice(0, 4),
        { status: PARCEL_STATUS.failed, at: thai("2026-11-26T16:00"), location: "หน้าบ้านผู้ซื้อ ซอยอ่อนนุช 17" },
      ],
      failureReason: "ไม่มีคนรับ โทรไม่ติด 2 ครั้ง",
    });
    signInAs(people.somying.id);
    const text = textOf((await openTracking()).html);

    expect(text).toContain("คำสั่งซื้อถูกยกเลิก");
    expect(text).toContain("ส่งไม่สำเร็จ 26 พ.ย. 16:00 · หน้าบ้านผู้ซื้อ ซอยอ่อนนุช 17 เหตุผล ไม่มีคนรับ โทรไม่ติด 2 ครั้ง");
    expect(text).not.toContain("ได้รับสินค้าแล้ว");
  });

  test("DLV-010 ผู้ขายร้านอื่นได้หน้า ไม่พบพัสดุนี้ และคนที่ยังไม่เข้าสู่ระบบถูกพาไปหน้าเข้าสู่ระบบ", async () => {
    addTrackedParcel({});

    expect(await openTracking()).toEqual({ redirect: "/login?next=%2Ftrack%2FBS0000000123" });
    signInAs(people.mana.id);
    expect(await openTracking()).toEqual({ redirect: "not-found" });
    const notFound = renderToStaticMarkup(<ParcelNotFound />);
    expect(notFound).toContain("ไม่พบพัสดุนี้");
    expect(notFound).not.toContain("BS0000000123");
    // ทางไปต่อคือค้นหาเลขอื่น
    expect(notFound).toMatch(/<a[^>]*href="\/track"[^>]*>ค้นหาพัสดุอื่น<\/a>/);
  });

  test("DLV-010 สไตล์ของหน้าไม่มีความกว้างตายตัวที่เกินจอ 360 จุด และปุ่มใช้สไตล์ปุ่มสูง 44 จุด", async () => {
    // เงื่อนไขของ @media คือความกว้างจอ ไม่ใช่ความกว้างของชิ้นในหน้า
    const css = readFileSync(join(process.cwd(), "src/features/delivery/components/tracking.module.css"), "utf8").replace(/@media[^{]*/g, "");
    const fixed = [...css.matchAll(/(?<!max-)width:\s*(\d+)px/g)].map((match) => Number(match[1]));
    expect(fixed.filter((px) => px > 328)).toEqual([]);

    addTrackedParcel({});
    signInAs(people.somying.id);
    const { html } = await openTracking();
    for (const button of html?.match(/<button [^>]*>/g) ?? []) expect(button).toMatch(/class="button/);
  });
});

describe("DLV-011 ค้นหาพัสดุ ผ่านหน้าเว็บ", () => {
  test("DLV-011 ก่อนพิมพ์เห็นตัวอย่างเลข และผู้ดูแลแพลตฟอร์มพิมพ์ตัวเล็กมีช่องว่าง ถูกพาไปหน้าติดตามพัสดุ", async () => {
    addTrackedParcel({ history: DELIVERED_HISTORY.slice(0, 4) });
    signInAs(people.wichai.id);

    expect(textOf((await openSearch()).html)).toContain("พิมพ์เลขติดตามพัสดุ เช่น BS0000000123");
    expect(await openSearch({ no: "bs0000000123 " })).toEqual({ redirect: "/track/BS0000000123" });
    const text = textOf((await openTracking()).html);
    expect(text).toContain("เปลี่ยนเป็น ส่งสำเร็จ");
    expect(text).toContain("เปลี่ยนเป็น ส่งไม่สำเร็จ");
  });

  test("DLV-011 พัสดุของคนอื่นได้ ไม่พบพัสดุนี้ รูปแบบผิดได้ข้อความรูปแบบ และค่าที่พิมพ์ยังอยู่ในช่อง", async () => {
    addTrackedParcel({ trackingNo: "BS0000000999", buyerId: people.otherBuyer.id });
    signInAs(people.somying.id);

    const other = await openSearch({ no: "BS0000000999" });
    expect(textOf(other.html)).toContain("ไม่พบพัสดุนี้");
    expect(textOf(other.html)).not.toContain("สมชายการช่าง");
    const bad = await openSearch({ no: "BS12" });
    expect(textOf(bad.html)).toContain("เลขติดตามพัสดุต้องเป็น BS ตามด้วยตัวเลข 10 หลัก");
    expect(bad.html).toContain('value="BS12"');

    request.cookies.clear();
    expect(await openSearch({ no: "BS0000000999" })).toEqual({ redirect: "/login?next=%2Ftrack" });
  });

  test("DLV-011 แถบด้านบนมีลิงก์ไปหน้าค้นหาพัสดุ เฉพาะบัญชีที่เข้าสู่ระบบแล้ว", () => {
    const [link] = nav.header;
    expect(link).toMatchObject({ label: "ติดตามพัสดุ", href: "/track" });
    expect(link.visibleTo?.(null)).toBe(false);
  });
});

describe("DLV-012 กด ได้รับสินค้าแล้ว ผ่านหน้าเว็บ", () => {
  test("DLV-012 ผู้ซื้อเห็นปุ่มพร้อมหน้าต่างถามยืนยัน กดยืนยันแล้วเห็นเวลาที่ยืนยันและปุ่มหายไป", async () => {
    const order = addTrackedParcel({});
    signInAs(people.somying.id);
    const before = (await openTracking()).html;
    expect(before).toContain("ได้รับสินค้าแล้ว");
    expect(before).toMatch(/<dialog[^>]*>[^]*ยืนยัน[^]*ยกเลิก[^]*<\/dialog>/);
    // ยังไม่กดยืนยันในหน้าต่าง คำสั่งซื้อจึงยังเหมือนเดิม
    expect(orderRow(order.id).status).toBe(ORDER_STATUS.shipping);

    vi.useFakeTimers({ now: new Date(thai("2026-11-26T18:00")), toFake: ["Date"] });
    expect(await pressConfirm()).toEqual({ value: { error: null } });
    expect(request.refreshed).toBe(1);

    const after = textOf((await openTracking()).html);
    expect(after).toContain("ผู้ซื้อยืนยันรับสินค้าแล้ว 26 พ.ย. 18:00");
    expect(after).not.toContain("ได้รับสินค้าแล้ว");
  });

  test("DLV-012 ผู้ขายกดแทนได้ข้อความ เฉพาะผู้ซื้อกดได้ ไม่เห็นปุ่ม และแท็บที่ออกจากระบบแล้วถูกพาไปเข้าสู่ระบบ", async () => {
    const order = addTrackedParcel({});
    signInAs(people.somchai.id);

    expect(textOf((await openTracking()).html)).not.toContain("ได้รับสินค้าแล้ว");
    expect(await pressConfirm()).toEqual({ value: { error: "เฉพาะผู้ซื้อกดได้" } });
    request.cookies.clear();
    expect(await pressConfirm()).toEqual({ redirect: "/login?next=%2Ftrack%2FBS0000000123&notice=relogin" });
    expect(orderRow(order.id).status).toBe(ORDER_STATUS.shipping);
    expect(request.refreshed).toBe(0);
  });
});

describe("DLV-013 ปิดคำสั่งซื้ออัตโนมัติ ผ่านหน้าเว็บ", () => {
  test("DLV-013 ก่อนครบกำหนดบอกวันที่ระบบจะยืนยันให้ หลังครบเห็นว่าระบบยืนยันให้", async () => {
    addTrackedParcel({});
    signInAs(people.somying.id);

    expect(textOf((await openTracking()).html)).toContain("ถ้าไม่กดยืนยัน ระบบจะยืนยันให้อัตโนมัติวันที่ 3 ธ.ค. 15:30");
    completeDueReceipts(db, new Date(thai("2026-12-03T15:30")));
    const text = textOf((await openTracking()).html);
    expect(text).toContain("ระบบยืนยันรับสินค้าให้อัตโนมัติ เพราะครบ 7 วัน 3 ธ.ค. 15:30");
    expect(text).not.toContain("ถ้าไม่กดยืนยัน");
  });

  test("DLV-013 ผู้ซื้อยืนยันก่อน หน้าแสดงข้อความยืนยันบรรทัดเดียวของผู้ซื้อ", async () => {
    addTrackedParcel({});
    confirmReceipt(db, "BS0000000123", people.somying, new Date(thai("2026-11-26T18:00")));
    completeDueReceipts(db, new Date(thai("2026-12-03T15:30")));
    signInAs(people.somying.id);
    const text = textOf((await openTracking()).html);

    expect(text.match(/ยืนยันรับสินค้า/g)).toHaveLength(1);
    expect(text).toContain("ผู้ซื้อยืนยันรับสินค้าแล้ว 26 พ.ย. 18:00");
  });
});

describe("DLV-014 หน้ากำลังโหลดและหน้าผิดพลาด", () => {
  test("DLV-014 ระหว่างรอเห็นโครงหน้าพร้อมคำว่า กำลังโหลด แทนประวัติ และถือว่าโหลดไม่ได้เมื่อเกิน 10 วินาที", () => {
    const html = renderToStaticMarkup(<TrackingLoading />);
    expect(html).toContain("data-skeleton");
    expect(textOf(html)).toContain("ประวัติการจัดส่ง กำลังโหลด");
    expect(html).not.toContain("โหลดข้อมูลไม่ได้ตอนนี้");
    expect(LOADING_TIMEOUT_MS).toBe(10_000);
  });

  test("DLV-014 โหลดไม่สำเร็จเห็น โหลดข้อมูลไม่ได้ตอนนี้ พร้อมปุ่มลองใหม่ และบันทึกไม่สำเร็จใช้ข้อความตาม requirement", async () => {
    const html = renderToStaticMarkup(<TrackingError error={new Error("ล่ม")} retry={() => {}} />);
    expect(html).toContain("โหลดข้อมูลไม่ได้ตอนนี้");
    expect(html).toContain("ลองใหม่");
    expect(SAVE_FAILED).toBe("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");

    addTrackedParcel({});
    signInAs(people.somying.id);
    db.close();
    await expect(openTracking()).rejects.toThrow();
  });
});

describe("MAP แผนที่การจัดส่งบนหน้าติดตามพัสดุ", () => {
  // พัสดุ BS0000000123 ของ delivery-map.md: ร้านอยู่เชียงใหม่ ผ่านลำปาง ที่อยู่จัดส่งอยู่กรุงเทพมหานคร
  const LAMPANG_HISTORY: HistoryEntry[] = [
    { status: PARCEL_STATUS.awaitingPacking, at: thai("2026-11-25T09:00"), location: "สมชายการช่าง", province: "เชียงใหม่" },
    { status: PARCEL_STATUS.handedOver, at: thai("2026-11-25T10:00"), location: "ไปรษณีย์ช้างเผือก", province: "เชียงใหม่" },
    { status: PARCEL_STATUS.inTransit, at: thai("2026-11-25T13:20"), location: "ศูนย์คัดแยกลำปาง", province: "ลำปาง" },
  ];
  const ROUTE_TEXT = "เชียงใหม่ → ลำปาง (ล่าสุด) → กรุงเทพมหานคร (ปลายทาง)";
  const NOTICE = "แผนที่แสดงจังหวัดที่พัสดุผ่านมาแล้ว ไม่ใช่ตำแหน่งปัจจุบัน";

  beforeEach(() => {
    db.prepare("UPDATE shops SET origin_province = 'เชียงใหม่' WHERE name = 'สมชายการช่าง'").run();
  });

  test("MAP-004 ผู้ซื้อเห็นแผนที่การจัดส่งที่มีหมุด 3 จังหวัด เส้นทึบ เส้นประ หมุดล่าสุด และข้อความว่าไม่ใช่ตำแหน่งปัจจุบัน", async () => {
    addTrackedParcel({ history: LAMPANG_HISTORY });
    const route = getTrackingView(db, "BS0000000123", people.somying)?.route;

    expect(route?.pins.map((pin) => pin.province)).toEqual(["เชียงใหม่", "ลำปาง", "กรุงเทพมหานคร"]);
    expect(route?.passed.map((stop) => stop.province)).toEqual(["เชียงใหม่", "ลำปาง"]);
    expect(route?.latest.province).toBe("ลำปาง");
    expect(route?.dashed).toBe(true);

    signInAs(people.somying.id);
    const { html } = await openTracking();
    const text = textOf(html);
    expect(text).toContain("แผนที่การจัดส่ง");
    expect(text).toContain(NOTICE);
    expect(html).toContain("data-delivery-map");
  });

  test("MAP-004 ผู้ขายร้านอื่นเห็นหน้า ไม่พบ และไม่เห็นแผนที่หรือชื่อจังหวัดใดของพัสดุนี้", async () => {
    addTrackedParcel({ history: LAMPANG_HISTORY });
    signInAs(people.mana.id);

    expect(await openTracking()).toEqual({ redirect: "not-found" });
    expect(getTrackingView(db, "BS0000000123", people.mana)).toBeNull();
    const notFound = renderToStaticMarkup(<ParcelNotFound />);
    for (const province of ["เชียงใหม่", "ลำปาง", "กรุงเทพมหานคร"]) expect(notFound).not.toContain(province);
    expect(notFound).not.toContain("data-delivery-map");
  });

  test("MAP-006 ข้อความเส้นทางมาจากเซิร์ฟเวอร์พร้อมหน้า จึงอ่านได้แม้ปิด JavaScript หรือแผนที่ไม่ขึ้น", async () => {
    addTrackedParcel({ history: LAMPANG_HISTORY });
    signInAs(people.somying.id);
    const { html } = await openTracking();

    expect(textOf(html)).toContain(ROUTE_TEXT);
    // ข้อความเส้นทางอยู่ใต้แผนที่
    expect(html!.indexOf("data-delivery-map")).toBeLessThan(html!.indexOf("เชียงใหม่ → ลำปาง"));
    // แต่ละรายการในประวัติบอกจังหวัดคู่กับสถานที่
    expect(textOf(html)).toContain("อยู่ระหว่างขนส่ง 25 พ.ย. 13:20 · ศูนย์คัดแยกลำปาง · ลำปาง");
  });

  test("MAP-005 ระหว่างแผนที่ยังโหลด ที่ของแผนที่เป็นกรอบสีพื้น ส่วนสถานะ ประวัติ และข้อความเส้นทางแสดงแล้ว", async () => {
    addTrackedParcel({ history: LAMPANG_HISTORY });
    signInAs(people.somying.id);
    const { html } = await openTracking();

    expect(html).toMatch(/<div[^>]*data-delivery-map="loading"/);
    expect(textOf(html)).not.toContain("แสดงแผนที่ไม่ได้");
    expect(headingOf(html)).toBe("ติดตามพัสดุ BS0000000123 อยู่ระหว่างขนส่ง");
    for (const expected of ["ศูนย์คัดแยกลำปาง", ROUTE_TEXT]) expect(textOf(html)).toContain(expected);
    expect(MAP_TIMEOUT_MS).toBe(10_000);
    const css = readFileSync(join(process.cwd(), "src/features/delivery/components/delivery-map.module.css"), "utf8");
    expect(css).toMatch(/\.map \{[^}]*background: var\(--color-surface\)/);
    expect(css).toMatch(/\.map \{[^}]*aspect-ratio/);
  });

  test("MAP-007 สองรายการแรกไม่มีจังหวัด ถูกข้ามบนแผนที่และข้อความเส้นทาง แต่ยังอยู่ในประวัติครบ 3 รายการ", async () => {
    addTrackedParcel({
      trackingNo: "BS0000000777",
      history: LAMPANG_HISTORY.map((entry, i) => (i < 2 ? { ...entry, province: undefined } : entry)),
    });
    signInAs(people.somying.id);
    const view = getTrackingView(db, "BS0000000777", people.somying);

    expect(view?.history).toHaveLength(3);
    expect(view?.route?.pins.map((pin) => pin.province)).toEqual(["เชียงใหม่", "ลำปาง", "กรุงเทพมหานคร"]);
    const text = textOf((await openTracking("BS0000000777")).html);
    expect(text).toContain(ROUTE_TEXT);
    expect(text).toContain("รอร้านจัดของ 25 พ.ย. 09:00 · สมชายการช่าง ");
  });

  test("MAP-007 จังหวัดในประวัติที่ไม่อยู่ในรายชื่อจังหวัดถูกข้ามบนแผนที่และข้อความเส้นทาง หน้ายังเปิดได้", async () => {
    addTrackedParcel({ history: [...LAMPANG_HISTORY, { ...LAMPANG_HISTORY[2], at: thai("2026-11-25T15:00"), province: "<b>ลำปาง</b>" }] });
    signInAs(people.somying.id);

    const { html } = await openTracking();

    expect(textOf(html)).toContain(ROUTE_TEXT);
    expect(html).toContain("&lt;b&gt;ลำปาง&lt;/b&gt;");
    expect(html).not.toContain("<b>ลำปาง</b>");
  });

  test("MAP-007 จังหวัดของที่อยู่จัดส่งไม่อยู่ในรายชื่อจังหวัด หน้าไม่มีแผนที่และข้อความเส้นทาง ส่วนสถานะกับประวัติยังอยู่", async () => {
    const order = addTrackedParcel({ history: LAMPANG_HISTORY });
    db.prepare("UPDATE orders SET ship_province = 'กรุงเทพฯ' WHERE id = ?").run(order.id);
    signInAs(people.somying.id);

    const { html } = await openTracking();

    expect(getTrackingView(db, "BS0000000123", people.somying)?.route).toBeNull();
    expect(headingOf(html)).toBe("ติดตามพัสดุ BS0000000123 อยู่ระหว่างขนส่ง");
    expect(textOf(html)).toContain("ศูนย์คัดแยกลำปาง · ลำปาง");
    expect(html).not.toContain("data-delivery-map");
    expect(textOf(html)).not.toContain(NOTICE);
  });

  test("MAP-009 พัสดุ ส่งไม่สำเร็จ ข้อความเส้นทางบอกปลายทางแยกต่างหาก และแผนที่ไม่มีเส้นประ", async () => {
    addTrackedParcel({
      trackingNo: "BS0000000999",
      orderStatus: ORDER_STATUS.cancelled,
      history: [
        ...LAMPANG_HISTORY,
        { status: PARCEL_STATUS.outForDelivery, at: thai("2026-11-26T09:00"), location: "ศูนย์กระจายพัสดุลำปาง", province: "ลำปาง" },
        { status: PARCEL_STATUS.failed, at: thai("2026-11-26T16:00"), location: "หน้าบ้านผู้ซื้อ", province: "ลำปาง" },
      ],
      failureReason: "ไม่มีคนรับ",
    });
    signInAs(people.somying.id);

    expect(getTrackingView(db, "BS0000000999", people.somying)?.route?.dashed).toBe(false);
    expect(textOf((await openTracking("BS0000000999")).html)).toContain("เชียงใหม่ → ลำปาง (ล่าสุด) · ปลายทาง กรุงเทพมหานคร");
  });
});

describe("DLV-Q01 หน้าช้า", () => {
  test("DLV-Q01 หน้าที่ยังไม่มาเห็นคำว่า กำลังโหลด ไม่ใช่หน้าเปล่า และเกิน 10 วินาทีเห็น โหลดข้อมูลไม่ได้ตอนนี้", () => {
    expect(textOf(renderToStaticMarkup(<TrackingLoading />))).toContain("กำลังโหลด");
    expect(renderToStaticMarkup(<TrackingError error={new Error("ช้า")} retry={() => {}} />)).toContain("โหลดข้อมูลไม่ได้ตอนนี้");
  });
});
