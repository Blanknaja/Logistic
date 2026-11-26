import { beforeAll, describe, expect, test, vi } from "vitest";
import { getBuyerOrder, listBuyerOrders, parseOrderStatus } from "@/features/checkout/server/buyer-orders";
import { getTrackingView } from "@/features/delivery/server/tracking";
import { listNotifications, NOTIFICATION_TYPE as T, openNotification } from "@/features/notification/server/notifications";
import { getPayPage } from "@/features/payment/server/payments";
import { getReviewTarget, listShopReviews } from "@/features/review/server/reviews";
import { getShopOrder } from "@/features/shop-orders/server/orders";
import { listStock, parseStockFilter } from "@/features/stock/server/stock";
import type { Db } from "@/shared/db";
import { createTestDb } from "@/shared/db/testing";
import { seed } from "@/shared/seed";

// test ในไฟล์นี้ไม่เข้าสู่ระบบด้วยรหัสผ่าน จึงไม่ hash รหัสผ่านจริงของ 54 บัญชี ซึ่งกินเครื่องจน test จับเวลาของไฟล์อื่นช้า
vi.mock("@/features/account/server/password", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/account/server/password")>()),
  hashPassword: async () => "not-a-real-hash",
}));

let db: Db;

type Account = { id: number; shopId: number | null };
type Note = { id: number; type: string; message: string; href: string; created_at: string; read_at: string | null };

const account = (name: string) =>
  db
    .prepare("SELECT a.id, s.id AS shopId FROM accounts a LEFT JOIN shops s ON s.owner_account_id = a.id WHERE a.email = ?")
    .get(`${name}@example.com`) as Account;

const notesOf = (name: string) =>
  db
    .prepare("SELECT id, type, message, href, created_at, read_at FROM notifications WHERE account_id = ? ORDER BY created_at DESC, id DESC")
    .all(account(name).id) as Note[];

const types = (notes: Note[]) => [...new Set(notes.map((note) => note.type))];
const unread = (notes: Note[]) => notes.filter((note) => note.read_at === null);

/** หน้าที่เกี่ยวข้องของแจ้งเตือนเปิดได้ด้วยบัญชีผู้รับ และข้อมูลในหน้าตรงกับข้อความ */
function opens(viewer: Account, note: Note): boolean {
  const url = new URL(note.href, "http://localhost");
  const [, first, second, third] = url.pathname.split("/").map(decodeURIComponent);
  const actor = { id: viewer.id, isAdmin: false, shopId: viewer.shopId };
  if (first === "pay") return getPayPage(db, viewer.id, Number(second)) !== null;
  if (first === "track") {
    const view = getTrackingView(db, second, actor);
    return view !== null && note.message.includes(second) && db.prepare("SELECT 1 FROM parcel_history h JOIN parcels p ON p.id = h.parcel_id WHERE p.tracking_no = ? AND h.created_at = ? AND instr(?, h.status) > 0").get(second, note.created_at, note.message) !== undefined;
  }
  if (first === "orders" && third === "review") {
    const target = getReviewTarget(db, viewer.id, second, Number(url.pathname.split("/")[4]));
    return target.state === "open" && target.review !== null && note.message.includes(target.item.productName);
  }
  if (first === "seller" && second === "reviews") {
    return viewer.shopId !== null && listShopReviews(db, viewer.shopId).counts.all > 0 && db.prepare("SELECT 1 FROM reviews r JOIN order_items i ON i.id = r.order_item_id WHERE r.shop_id = ? AND r.created_at = ? AND instr(?, i.product_name) > 0").get(viewer.shopId, note.created_at, note.message) !== undefined;
  }
  if (first === "orders" && second) return getBuyerOrder(db, viewer.id, second)?.status === "ยกเลิก" && note.message.includes(second);
  if (first === "orders") {
    const status = parseOrderStatus(url.searchParams.get("status"));
    return status === "ยกเลิก" && listBuyerOrders(db, viewer.id, { status }).orders.length > 0;
  }
  if (first === "seller" && second === "orders") return viewer.shopId !== null && getShopOrder(db, viewer.shopId, third) !== null && note.message.includes(third);
  if (first === "seller" && second === "stock") {
    const filter = parseStockFilter(url.searchParams.get("filter"));
    const rows = listStock(db, viewer.shopId!, { filter }).rows;
    return filter === "out" && rows.some((row) => note.message.includes(`${row.productName} ${row.variantLabel}`.trim()));
  }
  return false;
}

// สร้างข้อมูลตัวอย่างครั้งเดียวแล้วใช้ร่วมกันทั้งไฟล์
beforeAll(async () => {
  db = createTestDb();
  expect((await seed(db)).created).toBe(true);
});

describe("NTF-018 ข้อมูลตัวอย่าง", () => {
  test("NTF-018 buyer1 มีอย่างน้อย 25 รายการ ยังไม่อ่านอย่างน้อย 3 มีหน้า 2 และครบชนิดของผู้ซื้อเรื่องการจ่ายเงิน การจัดส่ง และคำสั่งซื้อถูกยกเลิก", () => {
    const notes = notesOf("buyer1");

    expect(notes.length).toBeGreaterThanOrEqual(25);
    expect(unread(notes).length).toBeGreaterThanOrEqual(3);
    expect(listNotifications(db, account("buyer1").id).pageCount).toBeGreaterThanOrEqual(2);
    expect(types(notes)).toEqual(expect.arrayContaining([T.paymentSucceeded, T.paymentFailed, T.paymentTimedOut, T.parcelStatus, T.orderCancelled]));
  });

  test("NTF-018 buyer2 และ buyer3 มีบัญชีละอย่างน้อย 6 รายการ ยังไม่อ่านอย่างน้อย 2 และอย่างน้อย 3 ชนิดรวมเรื่องสถานะการจัดส่ง", () => {
    for (const name of ["buyer2", "buyer3"]) {
      const notes = notesOf(name);
      expect(notes.length, name).toBeGreaterThanOrEqual(6);
      expect(unread(notes).length, name).toBeGreaterThanOrEqual(2);
      expect(types(notes).length, name).toBeGreaterThanOrEqual(3);
      expect(types(notes), name).toContain(T.parcelStatus);
    }
  });

  test("NTF-018 seller01 มีอย่างน้อย 12 รายการ ยังไม่อ่านอย่างน้อย 3 ครบชนิดของผู้ขายเรื่องคำสั่งซื้อใหม่ คำสั่งซื้อสำเร็จ และสต็อกเหลือ 0 ทุกรายการขึ้นต้นด้วย ร้านของฉัน", () => {
    const notes = notesOf("seller01");

    expect(notes.length).toBeGreaterThanOrEqual(12);
    expect(unread(notes).length).toBeGreaterThanOrEqual(3);
    expect(types(notes)).toEqual(expect.arrayContaining([T.shopNewOrder, T.shopOrderCompleted, T.shopStockEmpty]));
    expect(notes.every((note) => note.message.startsWith("ร้านของฉัน: "))).toBe(true);
  });

  test("NTF-018 ทุกรายการตรงกับคำสั่งซื้อ พัสดุ หรือสต็อกที่มีอยู่จริง และหน้าที่เกี่ยวข้องเปิดได้ด้วยบัญชีผู้รับ", () => {
    for (const name of ["buyer1", "buyer2", "buyer3", "seller01"]) {
      const viewer = account(name);
      const broken = notesOf(name).filter((note) => !opens(viewer, note));
      expect(broken.map((note) => `${name}: ${note.message} → ${note.href}`)).toEqual([]);
    }
  });

  test("NTF-018 แจ้งเตือนเรื่องสถานะการจัดส่งรายการบนสุดของ buyer1 พาไปหน้าติดตามพัสดุที่สถานะตรงกับข้อความ", () => {
    const viewer = account("buyer1");
    const top = notesOf("buyer1").find((note) => note.type === T.parcelStatus)!;
    const trackingNo = top.href.replace("/track/", "");

    const view = getTrackingView(db, trackingNo, { id: viewer.id, isAdmin: false, shopId: null });

    expect(top.message).toContain(` เป็น ${view?.parcelStatus}`);
    expect(listNotifications(db, viewer.id).items.slice(0, 10)).toHaveLength(10);
  });

  test("NTF-018 สร้างข้อมูลตัวอย่างซ้ำโดยไม่ล้างข้อมูล จำนวนไม่เพิ่ม ไม่มีรายการซ้ำ และรายการที่อ่านแล้วไม่กลับเป็นยังไม่อ่าน", async () => {
    const viewer = account("buyer1");
    const before = notesOf("buyer1");
    for (const note of unread(before).slice(1)) openNotification(db, viewer.id, note.id);

    expect((await seed(db)).created).toBe(false);

    const after = notesOf("buyer1");
    expect(after).toHaveLength(before.length);
    expect(unread(after)).toHaveLength(1);
    expect(new Set(after.map((note) => note.message + note.created_at)).size).toBe(after.length);
  });
});
