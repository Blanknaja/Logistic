// test ระดับหน้าและ server action ของรีวิว ส่วน vi.mock ลอกจาก src/features/account/account-pages.test.tsx

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import AdminNotFound from "@/app/admin/not-found";
import AdminReviewsError from "@/app/admin/reviews/error";
import AdminReviewsLoading from "@/app/admin/reviews/loading";
import AdminReviewsPage from "@/app/admin/reviews/page";
import OrderNotFound from "@/app/orders/[orderNo]/not-found";
import OrderPage from "@/app/orders/[orderNo]/page";
import ReviewError from "@/app/orders/[orderNo]/review/[itemId]/error";
import ReviewLoading from "@/app/orders/[orderNo]/review/[itemId]/loading";
import ReviewPage from "@/app/orders/[orderNo]/review/[itemId]/page";
import OrdersPage from "@/app/orders/page";
import { GET as getReviewImageRoute } from "@/app/review-images/[key]/route";
import { POST as postReviewImage } from "@/app/review-images/route";
import SellerNotFound from "@/app/seller/not-found";
import SellerReviewsError from "@/app/seller/reviews/error";
import SellerReviewsLoading from "@/app/seller/reviews/loading";
import SellerReviewsPage from "@/app/seller/reviews/page";
import StorefrontPage from "@/app/shops/[shopId]/page";
import { createSession } from "@/features/account/server/sessions";
import { hideReviewAction, replyAction, saveReviewAction, unhideReviewAction } from "@/features/review/actions";
import { ProductRating, ProductReviews } from "@/features/review/components/product-reviews";
import { ReviewsFailed } from "@/features/review/components/reviews-boundary";
import { nav, reviewsMenuLabel } from "@/features/review/nav";
import { MESSAGES, screenReviewFiles } from "@/features/review/rules";
import { writeReview } from "@/features/review/server/fixtures";
import { productRating } from "@/features/review/server/ratings";
import type { Db } from "@/shared/db";
import { addAccount, addOrder, addProduct, addShop } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";
import { headerLinks, sellerMenuLinks } from "@/shared/nav/registry";
import { SESSION_COOKIE } from "@/shared/session";
import { ORDER_STATUS, type OrderStatus } from "@/shared/statuses";

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

vi.mock("next/cache", () => ({ revalidatePath: () => {}, refresh: () => {} }));

vi.mock("@/shared/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/db")>()),
  getDb: () => request.db,
}));

afterEach(() => void vi.useRealTimers());

let db: Db;
let somying: number;
let manee: number;
let wichai: number;
let somchai: { accountId: number; shopId: number };
let mana: { accountId: number; shopId: number };
let screwdriver: { id: number; variantIds: number[] };
let hammer: { id: number; variantIds: number[] };
let football: { id: number; variantIds: number[] };

const at = (text: string) => new Date(`${text}:00.000+07:00`);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

beforeEach(() => {
  db = createTestDb();
  request.db = db;
  request.cookies.clear();
  somying = addAccount(db, { displayName: "สมหญิง", email: "somying@example.com" }).id;
  manee = addAccount(db, { displayName: "มานี", email: "manee@example.com" }).id;
  wichai = addAccount(db, { displayName: "วิชัย", isAdmin: true }).id;
  const somchaiShop = addShop(db, { name: "สมชายการช่าง" });
  const manaShop = addShop(db, { name: "มานะสปอร์ต" });
  somchai = { accountId: somchaiShop.ownerAccountId, shopId: somchaiShop.id };
  mana = { accountId: manaShop.ownerAccountId, shopId: manaShop.id };
  screwdriver = addProduct(db, { shopId: somchai.shopId, name: "ไขควง" });
  hammer = addProduct(db, { shopId: somchai.shopId, name: "ค้อน" });
  football = addProduct(db, { shopId: mana.shopId, name: "ลูกฟุตบอล" });
});

async function open(page: Promise<React.ReactNode> | React.ReactNode): Promise<{ redirect?: string; html?: string }> {
  try {
    return { html: renderToStaticMarkup(await page) };
  } catch (error) {
    if (error instanceof request.Redirected) return { redirect: error.url };
    throw error;
  }
}

async function submit<T>(action: Promise<T>): Promise<{ redirect?: string; state?: T }> {
  try {
    return { state: await action };
  } catch (error) {
    if (error instanceof request.Redirected) return { redirect: error.url };
    throw error;
  }
}

function signInAs(accountId: number): void {
  request.cookies.set(SESSION_COOKIE, createSession(db, accountId));
}

const props = (searchParams: Record<string, string> = {}, params: Record<string, string> = {}) =>
  ({ params: Promise.resolve(params), searchParams: Promise.resolve(searchParams) }) as never;

const form = (values: Record<string, string | string[]>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) for (const one of [value].flat()) data.append(name, one);
  return data;
};

function order(buyerAccountId: number, variantIds: number[], status: OrderStatus = ORDER_STATUS.completed) {
  const created = addOrder(db, { buyerAccountId, items: variantIds.map((variantId) => ({ variantId })), status });
  const itemIds = (db.prepare("SELECT id FROM order_items WHERE order_id = ? ORDER BY id").all(created.id) as { id: number }[]).map(
    (row) => row.id,
  );
  return { ...created, itemIds };
}

function reviewed(variantId: number, rating: number, input: Partial<Parameters<typeof writeReview>[1]> & { buyer?: number } = {}) {
  const placed = order(input.buyer ?? addAccount(db).id, [variantId]);
  return { ...writeReview(db, { ...input, orderItemId: placed.itemIds[0], rating }), itemId: placed.itemIds[0], orderNo: placed.orderNo };
}

const reviewPage = (orderNo: string, itemId: number | string, searchParams: Record<string, string> = {}) =>
  open(ReviewPage(props(searchParams, { orderNo, itemId: String(itemId) })));
const save = (values: Record<string, string | string[]>) => submit(saveReviewAction(form(values)));
const productReviews = (productId: number, query: Record<string, string> = {}) =>
  renderToStaticMarkup(<ProductReviews productId={productId} query={query} />);
const countReviews = () => Number(db.prepare("SELECT count(*) AS n FROM reviews").get()?.n);
/** รีวิวแรกในรายการ ตั้งแต่ชื่อผู้เขียนจนก่อนรีวิวถัดไป */
const firstReview = (html: string) => html.split('<li class="_review_')[1] ?? "";
const text = (html: string | undefined) => (html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("REV-001 ผู้ซื้อเขียนรีวิว", () => {
  test("REV-001 หน้าเขียนรีวิวมีรูปปก ชื่อสินค้า ดาว 5 ดวง ช่องข้อความพร้อมตัวนับ และช่องเพิ่มรูป", async () => {
    const mine = order(somying, [screwdriver.variantIds[0]]);
    signInAs(somying);
    const { html = "" } = await reviewPage(mine.orderNo, mine.itemIds[0]);

    expect(html).toContain("<h1>เขียนรีวิว</h1>");
    expect(html).toContain("ไขควง");
    expect(html.match(/type="radio"[^>]*name="rating"/g)).toHaveLength(5);
    expect(text(html)).toContain("0/500");
    expect(text(html)).toContain("0/3");
    expect(html).toContain(">ส่งรีวิว</button>");
    expect(html).not.toContain("แก้ไขรีวิว");
  });

  test("REV-001 ส่ง 4 ดาวพร้อมข้อความ เห็นส่งรีวิวแล้ว หน้าเดียวกันแสดงรีวิวของตัวเองพร้อมปุ่มแก้ไขรีวิว และหน้าสินค้าแสดง 4.3 กับ 3 รีวิวโดยรีวิวนี้อยู่บนสุด", async () => {
    vi.useFakeTimers({ now: at("2026-11-26T18:10"), toFake: ["Date"] });
    reviewed(screwdriver.variantIds[0], 5, { createdAt: "2026-11-20T03:00:00.000Z" });
    reviewed(screwdriver.variantIds[0], 4, { createdAt: "2026-11-21T03:00:00.000Z" });
    const mine = order(somying, [screwdriver.variantIds[0]]);
    signInAs(somying);

    const sent = await save({ orderNo: mine.orderNo, itemId: String(mine.itemIds[0]), mode: "new", rating: "4", body: "ด้ามจับถนัดมือ ส่งไว" });
    expect(sent.redirect).toBe(`/orders/${mine.orderNo}/review/${mine.itemIds[0]}?notice=sent`);

    const { html = "" } = await reviewPage(mine.orderNo, mine.itemIds[0], { notice: "sent" });
    expect(html).toContain("ส่งรีวิวแล้ว");
    expect(html).toContain("<h1>รีวิวของฉัน</h1>");
    expect(text(html)).toContain("4 ดาว");
    expect(html).toContain("ด้ามจับถนัดมือ ส่งไว");
    expect(html).toContain(`href="/orders/${mine.orderNo}/review/${mine.itemIds[0]}?edit=1"`);
    expect(text(html)).toContain("แก้ไขได้ถึง 3 ธ.ค. 18:10");
    expect(html).not.toContain(">ส่งรีวิว</button>");

    const product = productReviews(screwdriver.id);
    expect(text(product)).toContain("4.3 จาก 5 ดาว 3 รีวิว");
    expect(product.indexOf("ด้ามจับถนัดมือ ส่งไว")).toBeGreaterThan(0);
    expect(firstReview(product)).toContain("ส***");
    expect(text(renderToStaticMarkup(<ProductRating productId={screwdriver.id} />))).toContain("4.3 3 รีวิว");
  });

  test("REV-001 ไม่เลือกดาว หรือข้อความ 501 ตัวอักษร เห็นข้อความใต้ช่องนั้น และไม่มีรีวิวถูกบันทึก", async () => {
    const mine = order(somying, [screwdriver.variantIds[0]]);
    signInAs(somying);
    const base = { orderNo: mine.orderNo, itemId: String(mine.itemIds[0]), mode: "new" };

    expect((await save({ ...base, body: "ดี" })).state).toEqual({ ok: false, errors: { rating: "เลือกคะแนน 1 ถึง 5 ดาว" } });
    expect((await save({ ...base, rating: "4", body: "ก".repeat(501) })).state).toEqual({
      ok: false,
      errors: { body: "ข้อความยาวได้ไม่เกิน 500 ตัวอักษร" },
    });
    expect(countReviews()).toBe(0);
  });

  test("REV-001 ยังไม่เข้าสู่ระบบ ถูกพาไปหน้าเข้าสู่ระบบแล้วกลับมาหน้าเขียนรีวิว", async () => {
    const mine = order(somying, [screwdriver.variantIds[0]]);
    const page = await reviewPage(mine.orderNo, mine.itemIds[0]);
    expect(page.redirect).toBe(`/login?next=${encodeURIComponent(`/orders/${mine.orderNo}/review/${mine.itemIds[0]}`)}`);
  });
});

describe("REV-002 รูปในรีวิว", () => {
  const file = (name: string, type: string, megabytes: number) => ({ name, type, size: megabytes * 1024 * 1024 });

  test("REV-002 มีรูปแล้ว 2 รูป เลือกเพิ่ม PNG 1 MB JPG 7 MB และ GIF 1 MB รูปแรกถูกรับ รูปที่สองใหญ่เกิน รูปที่สามเกินจำนวน", () => {
    const result = screenReviewFiles(2, [file("a.png", "image/png", 1), file("b.jpg", "image/jpeg", 7), file("c.gif", "image/gif", 1)]);
    expect(result.accepted.map((picked) => picked.name)).toEqual(["a.png"]);
    expect(result.rejected).toEqual([
      { name: "b.jpg", error: "รูปต้องมีขนาดไม่เกิน 5 MB" },
      { name: "c.gif", error: "ใส่รูปได้ไม่เกิน 3 รูป" },
    ]);
  });

  test("REV-002 เลือก GIF ตอนมีรูป 2 รูป เห็นว่าใช้ได้เฉพาะ JPG หรือ PNG และรูป 5 MB พอดีถูกรับ", () => {
    expect(screenReviewFiles(2, [file("c.gif", "image/gif", 1)]).rejected).toEqual([{ name: "c.gif", error: "ใช้ได้เฉพาะรูป JPG หรือ PNG" }]);
    expect(screenReviewFiles(0, [file("a.jpg", "image/jpeg", 5), file("b.jpg", "image/jpeg", 2)]).accepted).toHaveLength(2);
  });

  test("REV-002 ส่งรูปขึ้นเซิร์ฟเวอร์ได้ที่อยู่ของรูป เปิดรูปได้ ส่งรีวิวพร้อมรูปแล้วรีวิวบนหน้าสินค้ามีรูปย่อที่กดแล้วเห็นรูปขนาดใหญ่", async () => {
    const mine = order(somying, [screwdriver.variantIds[0]]);
    signInAs(somying);
    const upload = async () => (await postReviewImage(new Request("http://localhost/review-images", { method: "POST", body: PNG }))).json();
    const [first, second] = [await upload(), await upload()] as { url: string }[];
    expect(first.url).toMatch(/^\/review-images\/[\w-]+$/);

    const shown = await getReviewImageRoute(new Request(`http://localhost${first.url}`), {
      params: Promise.resolve({ key: first.url.split("/").pop() ?? "" }),
    });
    expect(shown.status).toBe(200);
    expect(shown.headers.get("Content-Type")).toBe("image/png");

    const sent = await save({ orderNo: mine.orderNo, itemId: String(mine.itemIds[0]), mode: "new", rating: "4", image: [first.url, second.url] });
    expect(sent.redirect).toContain("notice=sent");
    const product = productReviews(screwdriver.id);
    expect(product).toContain(`<a href="${first.url}" target="_blank"`);
    expect(product.match(/<img src="\/review-images\//g)).toHaveLength(2);
  });

  test("REV-002 ยังไม่เข้าสู่ระบบ ไฟล์ที่ไม่ใช่รูป หรือรูปเกิน 5 MB ส่งขึ้นไม่ได้", async () => {
    const post = (body: Uint8Array<ArrayBuffer>) => postReviewImage(new Request("http://localhost/review-images", { method: "POST", body }));
    expect((await post(PNG)).status).toBe(401);
    signInAs(somying);
    const gif = await post(new TextEncoder().encode("GIF89a"));
    expect(gif.status).toBe(400);
    expect(await gif.json()).toEqual({ error: "ใช้ได้เฉพาะรูป JPG หรือ PNG" });
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(PNG);
    const tooBig = await post(big);
    expect(tooBig.status).toBe(413);
    expect(await tooBig.json()).toEqual({ error: "รูปต้องมีขนาดไม่เกิน 5 MB" });
  });
});

describe("REV-003 หนึ่งรายการในคำสั่งซื้อมีได้หนึ่งรีวิว", () => {
  test("REV-003 ส่งจากหน้าต่างที่สองหลังรีวิวไปแล้ว เห็นรายการนี้รีวิวไปแล้วพร้อมรีวิวเดิม และมีรีวิวเดียว", async () => {
    const mine = order(somying, [screwdriver.variantIds[0]]);
    signInAs(somying);
    const base = { orderNo: mine.orderNo, itemId: String(mine.itemIds[0]), mode: "new" };
    await save({ ...base, rating: "4", body: "ครั้งแรก" });

    const again = await save({ ...base, rating: "1", body: "หน้าต่างที่สอง" });
    expect(again.redirect).toBe(`/orders/${mine.orderNo}/review/${mine.itemIds[0]}?notice=reviewed`);
    const { html = "" } = await reviewPage(mine.orderNo, mine.itemIds[0], { notice: "reviewed" });
    expect(html).toContain("รายการนี้รีวิวไปแล้ว");
    expect(html).toContain("ครั้งแรก");
    expect(html).not.toContain("หน้าต่างที่สอง");
    expect(countReviews()).toBe(1);
  });

  test("REV-003 คำสั่งซื้อที่กำลังจัดส่งเห็นว่ารีวิวได้หลังคำสั่งซื้อสำเร็จ และคำสั่งซื้อของมานีเห็นไม่พบคำสั่งซื้อโดยไม่มีข้อมูลของมานี", async () => {
    const shipping = order(somying, [hammer.variantIds[0]], ORDER_STATUS.shipping);
    const hers = order(manee, [football.variantIds[0]]);
    signInAs(somying);

    const waiting = await reviewPage(shipping.orderNo, shipping.itemIds[0]);
    expect(waiting.html).toContain("รีวิวได้หลังคำสั่งซื้อสำเร็จ");
    expect(waiting.html).not.toContain('name="rating"');
    expect((await reviewPage(hers.orderNo, hers.itemIds[0])).redirect).toBe("not-found");
    expect((await reviewPage(hers.orderNo, "abc")).redirect).toBe("not-found");
    expect(renderToStaticMarkup(<OrderNotFound />)).toContain("ไม่พบคำสั่งซื้อ");

    const base = { mode: "new", rating: "5" };
    expect((await save({ ...base, orderNo: shipping.orderNo, itemId: String(shipping.itemIds[0]) })).state).toMatchObject({
      errors: { form: "รีวิวได้หลังคำสั่งซื้อสำเร็จ" },
    });
    expect((await save({ ...base, orderNo: hers.orderNo, itemId: String(hers.itemIds[0]) })).state).toMatchObject({
      errors: { form: "ไม่พบคำสั่งซื้อ" },
    });
    expect(countReviews()).toBe(0);
  });
});

describe("REV-004 แก้รีวิวภายใน 7 วัน", () => {
  function somyingReviewed() {
    const mine = reviewed(screwdriver.variantIds[0], 4, {
      buyer: somying,
      body: "ด้ามจับถนัดมือ ส่งไว",
      createdAt: at("2026-11-26T18:10").toISOString(),
      reply: { body: "ขอบคุณครับ", at: at("2026-11-26T19:10").toISOString() },
    });
    signInAs(somying);
    return mine;
  }

  test("REV-004 กดแก้ไขรีวิว เห็นฟอร์มที่มีค่าเดิม บันทึกแล้วรีวิวมีคำว่าแก้ไขแล้ว วันที่เดิม และคำตอบของร้านเดิม", async () => {
    vi.useFakeTimers({ now: at("2026-11-28T09:00"), toFake: ["Date"] });
    const mine = somyingReviewed();
    const editing = await reviewPage(mine.orderNo, mine.itemId, { edit: "1" });
    expect(editing.html).toContain("<h1>แก้ไขรีวิว</h1>");
    expect(editing.html).toContain(">บันทึก</button>");
    expect(editing.html).toContain("ด้ามจับถนัดมือ ส่งไว</textarea>");
    expect(editing.html).toMatch(/name="rating" checked="" value="4"/);
    expect(editing.html).not.toContain("ลบรีวิว");

    const saved = await save({ orderNo: mine.orderNo, itemId: String(mine.itemId), mode: "edit", rating: "2", body: "ใช้ 2 วันหัวไขควงบิ่น" });
    expect(saved.redirect).toBe(`/orders/${mine.orderNo}/review/${mine.itemId}?notice=saved`);
    const product = text(productReviews(screwdriver.id));
    expect(product).toContain("ใช้ 2 วันหัวไขควงบิ่น");
    expect(product).toContain("26 พ.ย. แก้ไขแล้ว");
    expect(product).toContain("คำตอบจากร้าน: ขอบคุณครับ");
    expect(productRating(db, screwdriver.id)).toMatchObject({ average: 2, count: 1 });
  });

  test("REV-004 กดบันทึกหลังครบ 7 วัน เห็นว่าแก้รีวิวได้ภายใน 7 วันหลังส่ง รีวิวเดิมไม่เปลี่ยน และเปิดหน้าใหม่ไม่มีปุ่มแก้ไขรีวิว", async () => {
    vi.useFakeTimers({ now: at("2026-12-03T18:11"), toFake: ["Date"] });
    const mine = somyingReviewed();

    const saved = await save({ orderNo: mine.orderNo, itemId: String(mine.itemId), mode: "edit", rating: "1", body: "แก้" });
    expect(saved.state).toEqual({ ok: false, errors: { form: "แก้รีวิวได้ภายใน 7 วันหลังส่ง" } });
    const { html = "" } = await reviewPage(mine.orderNo, mine.itemId, { edit: "1" });
    expect(html).toContain("ด้ามจับถนัดมือ ส่งไว");
    expect(html).not.toContain("แก้ไขรีวิว");
    expect(html).not.toContain(">บันทึก</button>");
  });
});

describe("REV-005 รายการที่รอรีวิวในหน้าคำสั่งซื้อของผู้ซื้อ", () => {
  const ordersPage = (searchParams: Record<string, string> = {}) => open(OrdersPage(props(searchParams)));
  const orderPage = (orderNo: string) => open(OrderPage(props({}, { orderNo })));

  test("REV-005 ตัวกรองรอรีวิว 1 เห็นเฉพาะคำสั่งซื้อที่ยังมีรายการรอรีวิวพร้อมป้าย และในคำสั่งซื้อนั้นค้อนมีปุ่มเขียนรีวิว ส่วนไขควงแสดง 4 ดาวกับลิงก์ดูรีวิวของฉัน", async () => {
    const mixed = order(somying, [screwdriver.variantIds[0], hammer.variantIds[0]]);
    writeReview(db, { orderItemId: mixed.itemIds[0], rating: 4 });
    for (let i = 0; i < 3; i++) {
      const done = order(somying, [football.variantIds[0]]);
      writeReview(db, { orderItemId: done.itemIds[0], rating: 5 });
    }
    order(somying, [football.variantIds[0]], ORDER_STATUS.paid);
    signInAs(somying);

    const all = await ordersPage();
    expect(all.html).toContain(">รอรีวิว 1</a>");
    expect(all.html?.match(/รอรีวิว 1 รายการ/g)).toHaveLength(1);

    const filtered = await ordersPage({ status: "รอรีวิว" });
    expect(filtered.html?.match(/<li class="_order_\w+">/g)).toHaveLength(1);
    expect(filtered.html).toContain(`href="/orders/${mixed.orderNo}"`);
    expect(filtered.html).toContain("รอรีวิว 1 รายการ");
    expect(filtered.html).toMatch(/aria-current="page"[^>]*>รอรีวิว 1</);

    const { html = "" } = await orderPage(mixed.orderNo);
    expect(html).toContain(`<a class="button button-secondary" href="/orders/${mixed.orderNo}/review/${mixed.itemIds[1]}">เขียนรีวิว</a>`);
    expect(html.match(/>เขียนรีวิว</g)).toHaveLength(1);
    expect(html).toContain("<span>4 ดาว</span>");
    expect(html).toContain(`<a class="link-action" href="/orders/${mixed.orderNo}/review/${mixed.itemIds[0]}">ดูรีวิวของฉัน</a>`);
  });

  test("REV-005 คำสั่งซื้อที่กำลังจัดส่งและที่ยกเลิก ไม่มีปุ่มเขียนรีวิวและไม่มีป้ายรอรีวิว และกรองรอรีวิวตอนไม่มีรายการเห็นข้อความว่าไม่มี", async () => {
    const shipping = order(somying, [hammer.variantIds[0]], ORDER_STATUS.shipping);
    const cancelled = order(somying, [hammer.variantIds[0]], ORDER_STATUS.cancelled);
    signInAs(somying);

    for (const orderNo of [shipping.orderNo, cancelled.orderNo]) {
      const { html = "" } = await orderPage(orderNo);
      expect(html).not.toContain("เขียนรีวิว");
      expect(html).not.toContain("รอรีวิว");
    }
    const list = await ordersPage();
    expect(list.html).toContain(">รอรีวิว 0</a>");
    expect(list.html).not.toContain("รายการ</span>");
    expect((await ordersPage({ status: "รอรีวิว" })).html).toContain("ไม่มีรายการที่รอรีวิว");
  });
});

describe("REV-006 สรุปคะแนนบนหน้ารายละเอียดสินค้า", () => {
  test("REV-006 5 ดาว 1 รีวิว กับ 4 ดาว 3 รีวิว เห็น 4.3 กับ 4 รีวิว และแถวของแต่ละดาว และคะแนนใกล้ชื่อสินค้ากดแล้วไปที่รายการรีวิว", () => {
    for (const rating of [5, 4, 4, 4]) reviewed(football.variantIds[0], rating);
    const html = productReviews(football.id);

    expect(html).toContain('<section id="reviews"');
    expect(text(html)).toContain("4.3 จาก 5 ดาว 4 รีวิว");
    const rows = [...(html.match(/aria-label="จำนวนรีวิวของแต่ละดาว">.*?<\/ul>/)?.[0] ?? "").matchAll(/<li>(.*?)<\/li>/g)].map((row) => text(row[1]).trim());
    expect(rows).toEqual(["5 ดาว 1", "4 ดาว 3", "3 ดาว 0", "2 ดาว 0", "1 ดาว 0"]);

    const link = renderToStaticMarkup(<ProductRating productId={football.id} />);
    expect(link).toContain('<a href="#reviews"');
    expect(text(link)).toContain("4.3 4 รีวิว");
  });

  test("REV-006 ยังไม่มีรีวิว หรือมีแต่รีวิวที่ถูกซ่อน เห็นยังไม่มีรีวิว ไม่มีตัวเลขคะแนนเฉลี่ยและไม่มีแถวของแต่ละดาว", () => {
    for (const hidden of [false, true]) {
      if (hidden) reviewed(football.variantIds[0], 5, { hidden: { reason: "ไม่เหมาะสม" } });
      const html = productReviews(football.id);
      expect(html).toContain("ยังไม่มีรีวิว");
      expect(html).not.toContain("จำนวนรีวิวของแต่ละดาว");
      expect(html).not.toMatch(/\d\.\d/);
      expect(renderToStaticMarkup(<ProductRating productId={football.id} />)).toBe("");
    }
  });
});

describe("REV-007 REV-008 รายการรีวิวบนหน้ารายละเอียดสินค้า", () => {
  function twentyThree() {
    const shoes = addProduct(db, { shopId: mana.shopId, name: "รองเท้าวิ่ง", options: [{ name: "แบบ", values: ["สีดำ ขนาด 42"] }] });
    [...Array(11).fill(5), ...Array(6).fill(4), ...Array(3).fill(3), 1, 1].forEach((rating, i) =>
      reviewed(shoes.variantIds[0], rating, { createdAt: new Date(Date.UTC(2026, 10, 1 + i)).toISOString() }),
    );
    reviewed(shoes.variantIds[0], 5, {
      buyer: somying,
      createdAt: at("2026-11-26T09:00").toISOString(),
      images: ["/review-images/a"],
      reply: { body: "ขอบคุณครับ", at: at("2026-11-26T09:30").toISOString() },
    });
    return shoes;
  }

  test("REV-007 หน้าแรกมี 10 รีวิว รีวิวบนสุดมีชื่อที่ปิด คะแนน วันที่ แบบย่อย รูปย่อ และคำตอบจากร้าน และหน้า 3 จาก 3 มี 3 รีวิวโดยปุ่มหน้าถัดไปกดไม่ได้", () => {
    vi.useFakeTimers({ now: at("2026-11-26T10:10"), toFake: ["Date"] });
    const shoes = twentyThree();
    const first = productReviews(shoes.id);
    expect(first.match(/<li class="_review_/g)).toHaveLength(10);
    const top = text(firstReview(first));
    expect(top).toContain("ส***");
    expect(top).toContain("5 ดาว");
    expect(top).toContain("26 พ.ย.");
    expect(top).toContain("สีดำ ขนาด 42");
    expect(top).toContain("คำตอบจากร้าน: ขอบคุณครับ 26 พ.ย.");
    expect(first).toContain('<img src="/review-images/a"');
    expect(text(first)).toContain("หน้า 1 จาก 3");
    expect(first).toContain(`href="/products/${shoes.id}?rpage=2#reviews"`);

    const third = productReviews(shoes.id, { rpage: "3" });
    expect(third.match(/<li class="_review_/g)).toHaveLength(3);
    expect(text(third)).toContain("หน้า 3 จาก 3");
    expect(third).toMatch(/<button type="button" class="button button-secondary" disabled="">หน้าถัดไป<\/button>/);
  });

  test("REV-007 โหลดหน้า 3 ใหม่หลังรีวิวถูกซ่อน 3 รีวิว เห็นหน้า 2 จาก 2 ที่มี 10 รีวิว ไม่เห็นหน้าเปล่า", () => {
    const shoes = twentyThree();
    db.prepare("UPDATE reviews SET status = 'ถูกซ่อน', hidden_reason = 'ไม่เหมาะสม' WHERE id IN (SELECT id FROM reviews WHERE product_id = ? ORDER BY id LIMIT 3)").run(shoes.id);
    const page = productReviews(shoes.id, { rpage: "3" });
    expect(text(page)).toContain("หน้า 2 จาก 2");
    expect(page.match(/<li class="_review_/g)).toHaveLength(10);
    expect(page).not.toContain("ไม่เหมาะสม");
  });

  test("REV-008 เลือก 1 ดาว เห็น 2 รีวิวที่หน้า 1 ตัวกรองมีจำนวนกำกับ และคะแนนเฉลี่ยไม่เปลี่ยน ส่วน 2 ดาวที่ไม่มีรีวิวเห็นข้อความและไม่มีเลขหน้า", () => {
    const shoes = twentyThree();
    const all = productReviews(shoes.id);
    const one = productReviews(shoes.id, { stars: "1", rpage: "2" });

    expect(one.match(/<li class="_review_/g)).toHaveLength(2);
    const filters = [...(one.match(/aria-label="กรองรีวิวตามจำนวนดาว">.*?<\/nav>/)?.[0] ?? "").matchAll(/<a[^>]*>(.*?)<\/a>/g)].map((link) => text(link[1]).trim());
    expect(filters).toEqual(["ทั้งหมด 23", "5 ดาว 12", "4 ดาว 6", "3 ดาว 3", "2 ดาว 0", "1 ดาว 2"]);
    expect(one).toMatch(/aria-current="page"[^>]*>1 ดาว/);
    expect(one).not.toContain("เปลี่ยนหน้ารีวิว");
    const average = (html: string) => html.match(/_averageNumber_\w+">([\d.]+)/)?.[1];
    expect(average(one)).toBe(average(all));

    const two = productReviews(shoes.id, { stars: "2" });
    expect(two).toContain("ยังไม่มีรีวิว 2 ดาว");
    expect(two).not.toContain("เปลี่ยนหน้ารีวิว");
    expect(two).toContain(`href="/products/${shoes.id}?stars=5#reviews"`);
  });

  test("REV-Q05 หน้าสินค้าและหน้ารีวิวของร้านไม่มีชื่อที่แสดงเต็ม อีเมล เบอร์โทร หรือที่อยู่ของผู้เขียนรีวิว", async () => {
    const shoes = twentyThree();
    signInAs(mana.accountId);
    const seller = await open(SellerReviewsPage(props()));
    for (const html of [productReviews(shoes.id), seller.html ?? ""]) {
      expect(html).toContain("ส***");
      expect(html).not.toContain("สมหญิง");
      expect(html).not.toContain("somying@example.com");
      expect(html).not.toContain("0812345678");
      expect(html).not.toContain("ถนนตัวอย่าง");
    }
  });
});

describe("REV-013 คะแนนของร้านบนหน้าร้าน", () => {
  const storefront = (shopId: number) => open(StorefrontPage(props({}, { shopId: String(shopId) })));

  test("REV-013 ร้านที่มีรีวิว 5 4 4 4 กับ 1 ดาว คนที่ยังไม่เข้าสู่ระบบเห็น ★ 3.6 กับ 5 รีวิวใกล้ชื่อร้าน และการ์ดสินค้ามีคะแนน", async () => {
    const shoes = addProduct(db, { shopId: mana.shopId, name: "รองเท้าวิ่ง" });
    for (const rating of [5, 4, 4, 4]) reviewed(football.variantIds[0], rating);
    reviewed(shoes.variantIds[0], 1);

    const { html = "" } = await storefront(mana.shopId);
    const identity = text(html.match(/<header.*?<\/header>/)?.[0]);
    expect(identity).toContain("มานะสปอร์ต ★ คะแนน 3.6 5 รีวิว");
    expect(html).toContain("★ 4.3 (4)");
    expect(html).toContain("★ 1.0 (1)");
  });

  test("REV-013 ร้านที่ยังไม่มีรีวิวที่แสดงอยู่ เห็นยังไม่มีรีวิวในตำแหน่งคะแนนของร้าน ไม่มี 0.0 และสินค้าแสดงตามปกติ", async () => {
    reviewed(football.variantIds[0], 5);
    const { html = "" } = await storefront(somchai.shopId);
    expect(text(html.match(/<header.*?<\/header>/)?.[0])).toContain("สมชายการช่าง ยังไม่มีรีวิว");
    expect(html).not.toContain("0.0");
    expect(html).not.toContain("★");
    expect(html).toContain("ไขควง");
  });
});

describe("REV-014 หน้ารีวิวของร้าน", () => {
  const sellerPage = (searchParams: Record<string, string> = {}) => open(SellerReviewsPage(props(searchParams)));

  function fortyFive() {
    for (let i = 0; i < 42; i++) {
      reviewed(hammer.variantIds[0], 5, { createdAt: new Date(Date.UTC(2026, 9, 1 + i)).toISOString(), reply: { body: "ขอบคุณครับ" } });
    }
    reviewed(hammer.variantIds[0], 3, { createdAt: "2026-11-20T00:00:00.000Z" });
    reviewed(hammer.variantIds[0], 2, { createdAt: "2026-11-21T00:00:00.000Z" });
    return reviewed(screwdriver.variantIds[0], 4, { buyer: somying, createdAt: at("2026-11-26T18:10").toISOString() });
  }

  test("REV-014 เมนูหลังบ้านมีลิงก์รีวิว ยังไม่ตอบ 3 และหน้ารีวิวของร้านกรองยังไม่ตอบเห็น 3 รีวิว รีวิวบนสุดมีสินค้า ชื่อที่ปิด คะแนน เลขคำสั่งซื้อ และปุ่มตอบรีวิว", async () => {
    const latest = fortyFive();
    reviewed(football.variantIds[0], 1, { body: "ของร้านอื่น" });
    expect(reviewsMenuLabel(somchai.shopId)).toBe("รีวิว ยังไม่ตอบ 3");
    expect(sellerMenuLinks(somchai.shopId, [nav])).toEqual([{ label: "รีวิว ยังไม่ตอบ 3", href: "/seller/reviews" }]);

    signInAs(somchai.accountId);
    const all = await sellerPage();
    expect(text(all.html)).toContain("ทั้งหมด 45");
    expect(text(all.html)).toContain("ยังไม่ตอบ 3");
    expect(all.html?.match(/<li class="_review_/g)).toHaveLength(20);
    expect(text(all.html)).toContain("หน้า 1 จาก 3");
    expect(all.html).not.toContain("ของร้านอื่น");

    const { html = "" } = await sellerPage({ filter: "unanswered" });
    expect(html.match(/<li class="_review_/g)).toHaveLength(3);
    const top = firstReview(html);
    expect(text(top)).toContain("ส***");
    expect(text(top)).toContain("4 ดาว");
    expect(text(top)).toContain(`ไขควง · คำสั่งซื้อ ${latest.orderNo}`);
    expect(top).toContain(">ตอบรีวิว</summary>");
    expect(html).toMatch(/aria-current="page"[^>]*>ยังไม่ตอบ/);
  });

  test("REV-014 ผู้ขายร้านอื่นเห็นเฉพาะรีวิวของร้านตัวเอง ส่วนบัญชีที่ยังไม่มีร้านถูกพาไปหน้าเปิดร้าน", async () => {
    fortyFive();
    reviewed(football.variantIds[0], 1, { body: "รีวิวของมานะสปอร์ต" });

    signInAs(mana.accountId);
    const { html = "" } = await sellerPage();
    expect(html).toContain("รีวิวของมานะสปอร์ต");
    expect(html.match(/<li class="_review_/g)).toHaveLength(1);
    expect(html).not.toContain("ไขควง");
    expect(html).not.toContain("ค้อน");

    signInAs(manee);
    expect((await sellerPage()).redirect).toBe("/open-shop");
    request.cookies.clear();
    expect((await sellerPage({ filter: "unanswered" })).redirect).toBe(`/login?next=${encodeURIComponent("/seller/reviews?filter=unanswered")}`);
  });

  test("REV-014 หน้านี้แสดงคะแนนเฉลี่ยและจำนวนรีวิวของร้านไว้ด้านบน", async () => {
    for (const rating of [5, 4, 4, 4]) reviewed(hammer.variantIds[0], rating);
    signInAs(somchai.accountId);
    expect(text((await sellerPage()).html)).toContain("รีวิวของร้าน ★ คะแนน 4.3 4 รีวิว");
  });
});

describe("REV-015 ร้านตอบรีวิว", () => {
  const reply = (reviewId: number, body: string, editing = "") => submit(replyAction(form({ reviewId: String(reviewId), body, editing })));

  test("REV-015 ตอบรีวิวแล้วตัวเลขยังไม่ตอบลดลง คำตอบขึ้นใต้รีวิวบนหน้าสินค้าพร้อมวันที่ แก้คำตอบแล้วมีคำว่าแก้ไขแล้ว และหน้ารีวิวของร้านมีปุ่มแก้ไขคำตอบ", async () => {
    vi.useFakeTimers({ now: at("2026-11-26T19:10"), toFake: ["Date"] });
    const target = reviewed(screwdriver.variantIds[0], 4, { buyer: somying, createdAt: at("2026-11-26T18:10").toISOString() });
    reviewed(hammer.variantIds[0], 5);
    reviewed(hammer.variantIds[0], 5);
    signInAs(somchai.accountId);
    expect(reviewsMenuLabel(somchai.shopId)).toBe("รีวิว ยังไม่ตอบ 3");

    expect((await reply(target.id, "ขอบคุณที่อุดหนุนครับ")).state).toEqual({ error: null });
    expect(reviewsMenuLabel(somchai.shopId)).toBe("รีวิว ยังไม่ตอบ 2");
    expect(text(productReviews(screwdriver.id))).toContain("คำตอบจากร้าน: ขอบคุณที่อุดหนุนครับ 26 พ.ย.");

    vi.setSystemTime(at("2026-11-26T19:15"));
    expect((await reply(target.id, "ขอบคุณที่อุดหนุนครับ มีปัญหาแจ้งร้านได้เลย", "1")).state).toEqual({ error: null });
    expect(text(productReviews(screwdriver.id))).toContain("คำตอบจากร้าน: ขอบคุณที่อุดหนุนครับ มีปัญหาแจ้งร้านได้เลย 26 พ.ย. แก้ไขแล้ว");
    expect(Number(db.prepare("SELECT count(*) AS n FROM reviews WHERE reply_body IS NOT NULL").get()?.n)).toBe(1);

    const { html = "" } = await open(SellerReviewsPage(props()));
    expect(html).toContain(">แก้ไขคำตอบ</summary>");
    expect(html).toContain("มีปัญหาแจ้งร้านได้เลย</textarea>");
  });

  test("REV-015 ช่องว่าง ตอบซ้ำจากหน้าต่างที่สอง และผู้ขายร้านอื่นตอบ: เห็นข้อความของแต่ละกรณี และรีวิวมีคำตอบเดิมคำตอบเดียว", async () => {
    const target = reviewed(hammer.variantIds[0], 4, { buyer: somying });
    signInAs(somchai.accountId);

    expect((await reply(target.id, "")).state).toEqual({ error: "กรอกคำตอบ 1 ถึง 500 ตัวอักษร" });
    expect((await reply(target.id, "ขอบคุณครับ")).state).toEqual({ error: null });
    expect((await reply(target.id, "ยินดีครับ")).state).toEqual({ error: "รีวิวนี้มีคำตอบของร้านแล้ว" });

    signInAs(mana.accountId);
    expect((await reply(target.id, "ตอบแทน")).redirect).toBe("not-found");
    expect(renderToStaticMarkup(<SellerNotFound />)).toContain("ไม่พบหน้านี้");
    expect(db.prepare("SELECT reply_body FROM reviews WHERE id = ?").get(target.id)?.reply_body).toBe("ขอบคุณครับ");

    request.cookies.clear();
    expect((await reply(target.id, "ไม่ได้เข้าสู่ระบบ")).redirect).toContain("/login?next=");
  });
});

describe("REV-016 ผู้ดูแลแพลตฟอร์มซ่อนและเลิกซ่อนรีวิว", () => {
  const adminPage = (searchParams: Record<string, string> = {}) => open(AdminReviewsPage(props(searchParams)));
  const hide = (reviewId: number, reason: string) => submit(hideReviewAction(form({ reviewId: String(reviewId), reason })));
  const unhide = (reviewId: number) => submit(unhideReviewAction(form({ reviewId: String(reviewId) })));

  test("REV-016 หน้าจัดการรีวิวแสดงรีวิวทุกร้านพร้อมชื่อเต็มของผู้ซื้อ ซ่อนพร้อมเหตุผลแล้วรีวิวเป็นถูกซ่อนและหายจากหน้าสินค้า เลิกซ่อนแล้วกลับมา", async () => {
    vi.useFakeTimers({ now: at("2026-11-26T20:00"), toFake: ["Date"] });
    const target = reviewed(football.variantIds[0], 1, { buyer: manee, body: "คำหยาบ" });
    reviewed(screwdriver.variantIds[0], 5, { buyer: somying });
    for (let i = 0; i < 5; i++) reviewed(hammer.variantIds[0], 2, { hidden: { reason: "เก่า" } });
    signInAs(wichai);

    const before = await adminPage();
    expect(text(before.html)).toContain("ทั้งหมด 7");
    expect(text(before.html)).toContain("แสดงอยู่ 2");
    expect(text(before.html)).toContain("ถูกซ่อน 5");
    expect(text(before.html)).toContain("มานี");
    expect(text(before.html)).toContain("ลูกฟุตบอล · มานะสปอร์ต · แสดงอยู่");
    expect(before.html).toContain(">ซ่อนรีวิว</summary>");
    expect(before.html).toContain(">ยืนยัน</button>");

    expect((await hide(target.id, "ใช้คำหยาบ")).state).toEqual({ error: null });
    const hidden = await adminPage({ status: "hidden" });
    expect(text(hidden.html)).toContain("ถูกซ่อน 6");
    expect(text(hidden.html)).toContain("ถูกซ่อนโดยผู้ดูแลแพลตฟอร์ม เหตุผล: ใช้คำหยาบ 26 พ.ย. 20:00");
    expect(hidden.html).toContain(">เลิกซ่อน</button>");
    expect(productReviews(football.id)).not.toContain("คำหยาบ");

    vi.setSystemTime(at("2026-11-26T20:30"));
    expect((await unhide(target.id)).state).toEqual({ error: null });
    expect(text((await adminPage({ status: "hidden" })).html)).toContain("ถูกซ่อน 5");
    expect(productReviews(football.id)).toContain("คำหยาบ");
  });

  test("REV-016 เหตุผลว่างเห็นข้อความและรีวิวยังแสดงอยู่ ซ่อนซ้ำเห็นว่าถูกซ่อนแล้วโดยเหตุผลและเวลาเดิมไม่เปลี่ยน", async () => {
    const target = reviewed(football.variantIds[0], 1);
    signInAs(wichai);
    expect((await hide(target.id, " ")).state).toEqual({ error: "กรอกเหตุผล 1 ถึง 200 ตัวอักษร" });
    expect(db.prepare("SELECT status FROM reviews WHERE id = ?").get(target.id)?.status).toBe("แสดงอยู่");

    vi.useFakeTimers({ now: at("2026-11-26T20:00"), toFake: ["Date"] });
    await hide(target.id, "ใช้คำหยาบ");
    vi.setSystemTime(at("2026-11-26T20:06"));
    signInAs(addAccount(db, { isAdmin: true }).id);
    expect((await hide(target.id, "ซ้ำ")).state).toEqual({ error: "รีวิวนี้ถูกซ่อนแล้ว" });
    expect(db.prepare("SELECT hidden_reason, hidden_at FROM reviews WHERE id = ?").get(target.id)).toEqual({
      hidden_reason: "ใช้คำหยาบ",
      hidden_at: at("2026-11-26T20:00").toISOString(),
    });
  });

  test("REV-016 ผู้ขายเปิดหน้าจัดการรีวิวหรือส่งคำขอซ่อน เห็นไม่พบหน้านี้ และลิงก์จัดการรีวิวมีเฉพาะบัญชีผู้ดูแลแพลตฟอร์ม", async () => {
    const target = reviewed(football.variantIds[0], 1);
    signInAs(somchai.accountId);
    expect((await adminPage()).redirect).toBe("not-found");
    expect((await hide(target.id, "แกล้ง")).redirect).toBe("not-found");
    expect((await unhide(target.id)).redirect).toBe("not-found");
    expect(renderToStaticMarkup(<AdminNotFound />)).toContain("ไม่พบหน้านี้");
    expect(db.prepare("SELECT status FROM reviews WHERE id = ?").get(target.id)?.status).toBe("แสดงอยู่");

    request.cookies.clear();
    expect((await adminPage()).redirect).toBe(`/login?next=${encodeURIComponent("/admin/reviews")}`);
    expect((await hide(target.id, "แกล้ง")).redirect).toBe("not-found");

    const viewer = { id: 1, email: "a@example.com", displayName: "ก", isAdmin: false, shopId: 7 };
    expect(headerLinks({ ...viewer, isAdmin: true, shopId: null }, [nav])).toEqual([{ label: "จัดการรีวิว", href: "/admin/reviews" }]);
    expect(headerLinks(viewer, [nav])).toEqual([]);
    expect(headerLinks(null, [nav])).toEqual([]);
  });
});

describe("REV-017 รีวิวที่ถูกซ่อน", () => {
  test("REV-017 ผู้ซื้อเจ้าของรีวิวเห็นรีวิวของตัวเองพร้อมป้ายและเหตุผลโดยไม่มีปุ่มแก้ไขรีวิว และร้านเห็นรีวิวนั้นพร้อมป้ายเดียวกันโดยไม่มีปุ่มตอบรีวิว", async () => {
    for (const rating of [5, 4, 4]) reviewed(football.variantIds[0], rating, { reply: { body: "ขอบคุณครับ" } });
    const hers = reviewed(football.variantIds[0], 1, { buyer: manee, body: "คำหยาบ", hidden: { reason: "ใช้คำหยาบ" } });

    expect(text(productReviews(football.id))).toContain("4.3 จาก 5 ดาว 3 รีวิว");
    expect(productReviews(football.id)).not.toContain("คำหยาบ");

    signInAs(manee);
    const own = await reviewPage(hers.orderNo, hers.itemId, { edit: "1" });
    expect(text(own.html)).toContain("ถูกซ่อนโดยผู้ดูแลแพลตฟอร์ม เหตุผล: ใช้คำหยาบ");
    expect(own.html).toContain("คำหยาบ");
    expect(own.html).not.toContain("แก้ไขรีวิว");
    expect(own.html).not.toContain('name="rating"');

    signInAs(mana.accountId);
    const seller = await open(SellerReviewsPage(props()));
    expect(text(seller.html)).toContain("ถูกซ่อนโดยผู้ดูแลแพลตฟอร์ม เหตุผล: ใช้คำหยาบ");
    expect(seller.html).not.toContain("ตอบรีวิว");
    expect(reviewsMenuLabel(mana.shopId)).toBe("รีวิว");
  });

  test("REV-017 กดบันทึกหรือส่งคำตอบหลังรีวิวถูกซ่อน ทั้งสองคนเห็นว่าแก้หรือตอบไม่ได้ และรีวิวกับคำตอบไม่เปลี่ยน", async () => {
    const hers = reviewed(football.variantIds[0], 1, { buyer: manee, hidden: { reason: "ใช้คำหยาบ" } });
    const message = "รีวิวนี้ถูกซ่อนโดยผู้ดูแลแพลตฟอร์ม แก้หรือตอบไม่ได้";

    signInAs(manee);
    expect((await save({ orderNo: hers.orderNo, itemId: String(hers.itemId), mode: "edit", rating: "5", body: "แก้" })).state).toEqual({
      ok: false,
      errors: { form: message },
    });
    signInAs(mana.accountId);
    expect((await submit(replyAction(form({ reviewId: String(hers.id), body: "ขอโทษครับ", editing: "" })))).state).toEqual({ error: message });
    expect(db.prepare("SELECT rating, body, reply_body FROM reviews WHERE id = ?").get(hers.id)).toEqual({ rating: 1, body: "", reply_body: null });
  });
});

describe("REV-018 หน้าว่าง หน้ากำลังโหลด และหน้าผิดพลาด", () => {
  test("REV-018 ร้านที่ยังไม่มีรีวิวเห็นข้อความว่าร้านของคุณยังไม่มีรีวิว ตัวกรองเป็น 0 และเมนูหลังบ้านไม่มีตัวเลขต่อท้ายลิงก์รีวิว", async () => {
    signInAs(somchai.accountId);
    const { html = "" } = await open(SellerReviewsPage(props()));
    expect(html).toContain("ร้านของคุณยังไม่มีรีวิว");
    expect(text(html)).toContain("ทั้งหมด 0");
    expect(text(html)).toContain("ยังไม่ตอบ 0");
    expect(reviewsMenuLabel(somchai.shopId)).toBe("รีวิว");
  });

  test("REV-018 ตัวกรองยังไม่ตอบที่ไม่มีรายการเห็นตอบครบทุกรีวิวแล้ว และหน้าจัดการรีวิวที่ไม่มีรายการเห็นไม่มีรีวิวในสถานะนี้", async () => {
    reviewed(hammer.variantIds[0], 5, { reply: { body: "ขอบคุณครับ" } });
    signInAs(somchai.accountId);
    expect((await open(SellerReviewsPage(props({ filter: "unanswered" })))).html).toContain("ตอบครบทุกรีวิวแล้ว");
    signInAs(wichai);
    expect((await open(AdminReviewsPage(props({ status: "hidden" })))).html).toContain("ไม่มีรีวิวในสถานะนี้");
  });

  test("REV-018 ระหว่างรอทุกหน้าแสดงตัวบอกว่ากำลังโหลด และโหลดไม่สำเร็จแสดงโหลดรีวิวไม่สำเร็จพร้อมปุ่มลองใหม่", () => {
    for (const Loading of [ReviewLoading, SellerReviewsLoading, AdminReviewsLoading]) {
      expect(renderToStaticMarkup(<Loading />)).toContain('role="status"');
    }
    for (const Failed of [ReviewError, SellerReviewsError, AdminReviewsError]) {
      const html = renderToStaticMarkup(<Failed error={new Error("x")} retry={() => {}} />);
      expect(html).toContain("โหลดรีวิวไม่สำเร็จ");
      expect(html).toContain(">ลองใหม่</button>");
    }
    const section = renderToStaticMarkup(<ReviewsFailed />);
    expect(section).toContain('role="alert"');
    expect(section).toContain("<h2");
    expect(section).toContain("โหลดรีวิวไม่สำเร็จ");
    expect(section).toContain(">ลองใหม่</button>");
    expect(MESSAGES.saveFailed).toBe("บันทึกไม่สำเร็จ");
  });

  test("REV-018 เมนูหลังบ้านนับรีวิวที่ยังไม่ตอบไม่ได้ ลิงก์รีวิวยังอยู่โดยไม่มีตัวเลข", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    request.db = undefined;
    expect(reviewsMenuLabel(somchai.shopId)).toBe("รีวิว");
  });
});

describe("REV-Q04 ใช้บนมือถือได้", () => {
  test("REV-Q04 ดาวที่ใช้เลือกคะแนนสูงและกว้างอย่างน้อย 44 จุด และสไตล์ของรีวิวไม่มีความกว้างตายตัวที่เกินจอ 360 จุด ใช้เฉพาะค่าจาก token", () => {
    const css = readFileSync(join(process.cwd(), "src/features/review/components/review.module.css"), "utf8");
    const globals = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(css).toMatch(/\.starOption \{[^}]*width: var\(--tap\);[^}]*height: var\(--tap\)/);
    expect(globals).toMatch(/--tap: 44px/);
    expect(globals).toMatch(/\.button \{[^}]*min-height: var\(--tap\)/);
    expect([...css.matchAll(/(\d+)px/g)].map((match) => Number(match[1])).filter((size) => size > 1)).toEqual([]);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
  });
});
