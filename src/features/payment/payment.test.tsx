// test ของ PAY ทั้งกฎของธุรกิจ หน้าเว็บ และ server action ใช้ตัวจำลองแทน Omise จึงไม่ต้องต่ออินเทอร์เน็ต
// ส่วน vi.mock ลอกจาก src/features/account/account-pages.test.tsx และให้ getPaymentProvider() คืนตัวจำลองของ test

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import PayError from "@/app/pay/[groupId]/error";
import PayLoading from "@/app/pay/[groupId]/loading";
import PayNotFound from "@/app/pay/[groupId]/not-found";
import PayPage from "@/app/pay/[groupId]/page";
import { POST as webhook } from "@/app/pay/omise-webhook/route";
import { createSession } from "@/features/account/server/sessions";
import {
  changeMethodAction,
  checkStatusAction,
  markSimulatorChargeAction,
  payByCardAction,
  payByPromptPayAction,
  pollPaymentAction,
  setSimulatorModeAction,
} from "@/features/payment/actions";
import { CLIENT_TIMEOUT_MS } from "@/features/payment/components/pay-form";
import { POLL_INTERVAL_MS } from "@/features/payment/components/payment-poller";
import { QrImage } from "@/features/payment/components/qr-image";
import type { CardFields } from "@/features/payment/server/card";
import { createOmiseProvider } from "@/features/payment/server/omise";
import recorded from "@/features/payment/server/omise-recorded.json";
import {
  abandonPendingPayments,
  checkPaymentStatus,
  getPayPage,
  handleChargeNotification,
  markGroupPaid,
  payByCard,
  payByPromptPay,
  syncGroupPayments,
} from "@/features/payment/server/payments";
import { LATE_ANSWER_MARGIN_MS, PROVIDER_TIMEOUT_MS } from "@/features/payment/server/provider";
import { createSimulator, type Simulator } from "@/features/payment/server/simulator";
import { openDb, type Db } from "@/shared/db";
import { addAccount, addOrder, addPayment, addProduct, addShop } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";
import { SESSION_COOKIE } from "@/shared/session";

const request = vi.hoisted(() => ({
  db: undefined as Db | undefined,
  provider: undefined as unknown,
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
  useRouter: () => ({ refresh: () => {} }),
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

vi.mock("@/shared/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/db")>()),
  getDb: () => request.db,
}));

vi.mock("@/features/payment/server/config", () => ({ getPaymentProvider: () => request.provider }));

let db: Db;
let sim: Simulator;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  setNow("14:00");
  db = createTestDb();
  sim = createSimulator();
  request.db = db;
  request.provider = sim;
  request.cookies.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

/** เวลาประเทศไทยของวันที่ 24 พ.ย. 2026 เช่น at("14:05") */
function at(time: string): Date {
  const [hour, minute, second = 0] = time.split(":").map(Number);
  return new Date(Date.UTC(2026, 10, 24, hour - 7, minute, second));
}

function setNow(time: string): Date {
  vi.setSystemTime(at(time));
  return at(time);
}

/** สองคำสั่งซื้อ `รอจ่ายเงิน` ในกลุ่มเดียว: ร้านบ้านกาแฟ 290 บาท (250 + ค่าส่ง 40) และร้านผ้าทอมือ 160 บาท (120 + 40) */
function addGroup(orderedAt = "14:00") {
  const buyer = addAccount(db, { displayName: "สมชาย" });
  const coffee = addShop(db, { name: `บ้านกาแฟ ${buyer.id}` });
  const cloth = addShop(db, { name: `ผ้าทอมือ ${buyer.id}` });
  const coffeeProduct = addProduct(db, { shopId: coffee.id, price: 250, stock: 5 });
  const clothProduct = addProduct(db, { shopId: cloth.id, price: 120, stock: 5 });
  const time = at(orderedAt).toISOString();
  const first = addOrder(db, { buyerAccountId: buyer.id, items: [{ variantId: coffeeProduct.variantIds[0] }], orderedAt: time });
  const second = addOrder(db, {
    buyerAccountId: buyer.id,
    items: [{ variantId: clothProduct.variantIds[0] }],
    groupId: first.groupId,
    orderedAt: time,
  });
  return {
    buyerId: buyer.id,
    groupId: first.groupId,
    orderNos: [first.orderNo, second.orderNo],
    coffee,
    variantIds: [coffeeProduct.variantIds[0], clothProduct.variantIds[0]],
  };
}

const GOOD: CardFields = { number: "4242 4242 4242 4242", name: "SOMCHAI JAIDEE", expiry: "12/28", securityCode: "123" };
const LOW_FUNDS: CardFields = { ...GOOD, number: "4111 1111 1114 0011" };

function signInAs(accountId: number): void {
  request.cookies.set(SESSION_COOKIE, createSession(db, accountId));
}

const form = (values: Record<string, string | number>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, String(value));
  return data;
};

const cardForm = (groupId: number, card: CardFields) => form({ groupId, ...card });

async function open(page: Promise<React.ReactNode>): Promise<{ redirect?: string; html?: string }> {
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

async function payPage(groupId: number, search: Record<string, string> = {}): Promise<string> {
  const { html, redirect } = await open(
    PayPage({ params: Promise.resolve({ groupId: String(groupId) }), searchParams: Promise.resolve(search) }),
  );
  if (redirect) throw new Error(`ถูกพาไป ${redirect}`);
  return html ?? "";
}

const payments = (groupId: number) =>
  db
    .prepare("SELECT method, status, amount, started_at, resolved_at, omise_charge_id, qr_image_url FROM payments WHERE group_id = ? ORDER BY id")
    .all(groupId) as { method: string; status: string; amount: number; started_at: string; resolved_at: string | null; omise_charge_id: string | null; qr_image_url: string | null }[];

const orderStatuses = (groupId: number) =>
  (db.prepare("SELECT status FROM orders WHERE group_id = ? ORDER BY id").all(groupId) as { status: string }[]).map((o) => o.status);

const stock = (variantIds: number[]) =>
  variantIds.map((id) => (db.prepare("SELECT stock FROM variants WHERE id = ?").get(id) as { stock: number }).stock);

/** ทำแทนตัวยกเลิกเมื่อหมดเขตจ่ายของ CHK-008 ซึ่งเป็นของอีก ticket */
const cancelForDeadline = (groupId: number) =>
  db.prepare("UPDATE orders SET status = 'ยกเลิก', cancel_reason = 'หมดเวลาจ่ายเงิน', cancelled_at = ? WHERE group_id = ?").run(
    new Date().toISOString(),
    groupId,
  );

const pendingChargeId = (groupId: number) => payments(groupId).find((p) => p.status === "รอผล")?.omise_charge_id ?? "";
const PAY_BUTTON = /<button[^>]*type="submit"[^>]*>จ่ายเงิน<\/button>/;

/** ผู้ซื้อเข้าสู่ระบบแล้วจ่ายด้วยบัตรผ่าน server action */
async function payCard(groupId: number, card: CardFields, time: string) {
  setNow(time);
  return submit(payByCardAction(cardForm(groupId, card)));
}

async function payQr(groupId: number, time: string) {
  setNow(time);
  return submit(payByPromptPayAction(form({ groupId })));
}

describe("PAY-001 หน้าจ่ายเงิน", () => {
  test("PAY-001 เปิดเวลา 14:05 เห็นยอดรวม 450 ยอดแยกร้าน เวลาที่เหลือ 25 นาที และปุ่มเลือกบัตรกับ PromptPay", async () => {
    const group = addGroup("14:00");
    signInAs(group.buyerId);
    setNow("14:05");
    const html = await payPage(group.groupId);

    for (const text of ["ยอดที่ต้องจ่าย ฿450", `ร้าน บ้านกาแฟ ${group.buyerId}`, "฿290", `ร้าน ผ้าทอมือ ${group.buyerId}`, "฿160", "เหลือเวลาจ่าย 25 นาที"]) {
      expect(html).toContain(text);
    }
    expect(html).toMatch(/href="\/pay\/\d+\?method=card"[^>]*>บัตร</);
    expect(html).toMatch(/href="\/pay\/\d+\?method=promptpay"[^>]*>PromptPay</);
    expect(renderToStaticMarkup(<PayLoading />)).toContain("กำลังโหลด");
  });

  test("PAY-001 หน้าว่าง: จ่ายแล้วตั้งแต่ 14:06 เปิดเวลา 14:20 เห็นผลการจ่าย 450 บาท และไม่มีปุ่มจ่ายเงิน", async () => {
    const group = addGroup("14:00");
    signInAs(group.buyerId);
    await payCard(group.groupId, GOOD, "14:06");
    setNow("14:20");
    const html = await payPage(group.groupId);

    expect(html).toContain("จ่ายแล้ว ฿450");
    expect(html).not.toContain("ยอดที่ต้องจ่าย");
    expect(html).not.toMatch(PAY_BUTTON);
    expect(html).not.toContain("เลือกวิธีจ่าย");
  });

  test("PAY-001 โหลดข้อมูลไม่ได้ เห็นข้อความกับปุ่มลองใหม่ ไม่มีปุ่มจ่ายเงิน คำสั่งซื้อและสต็อกที่จองยังอยู่", async () => {
    const group = addGroup("14:00");
    signInAs(group.buyerId);
    setNow("14:05");
    const before = stock(group.variantIds);
    const prepare = vi.spyOn(db, "prepare");
    prepare.mockImplementation(() => {
      throw new Error("ฐานข้อมูลล่ม");
    });
    await expect(payPage(group.groupId)).rejects.toThrow("ฐานข้อมูลล่ม");
    prepare.mockRestore();

    const html = renderToStaticMarkup(<PayError error={new Error("ล่ม")} retry={() => {}} />);
    expect(html).toContain("โหลดหน้าจ่ายเงินไม่ได้ ลองใหม่อีกครั้ง");
    expect(html).toContain("ลองใหม่");
    expect(html).not.toContain("จ่ายเงิน<");
    expect(orderStatuses(group.groupId)).toEqual(["รอจ่ายเงิน", "รอจ่ายเงิน"]);
    expect(stock(group.variantIds)).toEqual(before);
  });
});

describe("หน้าจ่ายเงินให้ข้อมูลที่ผู้ซื้อมาหาตั้งแต่จอแรก", () => {
  test("ยังไม่เลือกวิธีจ่าย เปิดแบบกรอกบัตรไว้ก่อน และยอดที่ต้องจ่ายอยู่ข้างปุ่มจ่ายเงิน", async () => {
    const group = addGroup("14:00");
    signInAs(group.buyerId);
    setNow("14:05");
    const html = await payPage(group.groupId);

    expect(html).toMatch(/class="chip" aria-current="true"[^>]*>บัตร</);
    expect(html.match(/<input [^>]*name="(number|name|expiry|securityCode)"/g)).toHaveLength(4);
    expect(html).toMatch(/<p class="_due_\w+">ยอดที่ต้องจ่าย ฿450<\/p><button type="submit" class="button">จ่ายเงิน<\/button>/);
    expect(html.match(/฿450/g)).toHaveLength(1);
  });

  test("ช่องเดือนปีหมดอายุกับรหัสหลังบัตรอยู่แถวเดียวกันและกว้างไม่เกิน 12 ตัวอักษร", async () => {
    const group = addGroup("14:00");
    signInAs(group.buyerId);
    setNow("14:05");
    const html = await payPage(group.groupId, { method: "card" });
    const css = readFileSync(join(process.cwd(), "src/features/payment/components/payment.module.css"), "utf8");

    expect(html).toMatch(/<div class="_pair_\w+">.*class="input _short_\w+"[^>]*name="expiry".*class="input _short_\w+"[^>]*name="securityCode"/);
    expect(Number(css.match(/\.short \{\s*max-width: (\d+)ch/)?.[1])).toBeLessThanOrEqual(12);
  });

  test("เวลาที่เหลือเป็นสถานะปกติ และเป็นสีเตือนเมื่อเหลือไม่เกิน 5 นาที", async () => {
    const group = addGroup("14:00");
    signInAs(group.buyerId);
    const deadline = /<p class="([^"]*)">เหลือเวลาจ่าย/;

    setNow("14:24");
    expect((await payPage(group.groupId)).match(deadline)?.[1]).not.toMatch(/deadlineSoon/);
    setNow("14:25");
    expect((await payPage(group.groupId)).match(deadline)?.[1]).toMatch(/deadlineSoon/);
  });
});

describe("PAY-002 เครื่องหมายเงินทดลอง", () => {
  test("PAY-002 เลือกบัตร เห็นข้อความโหมดทดลองก่อนหัวข้อหน้า และใต้ช่องเลขบัตรบอกว่าใช้ได้เฉพาะบัตรทดลอง", async () => {
    const group = addGroup("14:00");
    signInAs(group.buyerId);
    setNow("14:05");
    const html = await payPage(group.groupId, { method: "card" });

    expect(html.indexOf("โหมดทดลอง ไม่มีการตัดเงินจริง")).toBeGreaterThan(-1);
    expect(html.indexOf("โหมดทดลอง ไม่มีการตัดเงินจริง")).toBeLessThan(html.indexOf("<h1"));
    expect(html).toMatch(/name="number"[^>]*\/>(<p [^>]*>[^<]*<\/p>)?<\/div><p [^>]*>ใช้เลขบัตรทดลองของ Omise เท่านั้น<\/p>/);
  });

  test("PAY-002 บัตรถูกปฏิเสธ หน้าจ่ายไม่สำเร็จยังมีข้อความโหมดทดลองที่ด้านบน", async () => {
    const group = addGroup("14:00");
    signInAs(group.buyerId);
    await payCard(group.groupId, LOW_FUNDS, "14:07");
    const html = await payPage(group.groupId);

    expect(html).toContain("จ่ายเงินไม่สำเร็จ");
    expect(html.indexOf("โหมดทดลอง ไม่มีการตัดเงินจริง")).toBeLessThan(html.indexOf("<h1"));
  });
});

describe("PAY-003 จ่ายด้วยบัตร", () => {
  test("PAY-003 บัตรทดลองแบบจ่ายสำเร็จ ตัดบัตรยอดรวม 450 บาทครั้งเดียว แล้วไปหน้าจ่ายสำเร็จ", async () => {
    const group = addGroup("14:00");
    signInAs(group.buyerId);
    const result = await payCard(group.groupId, GOOD, "14:06");

    expect(result.redirect).toBe(`/pay/${group.groupId}`);
    expect(sim.charges.map((c) => [c.amount, c.status])).toEqual([[450, "successful"]]);
    expect(await payPage(group.groupId)).toContain("จ่ายแล้ว ฿450 ด้วยบัตรลงท้าย 4242");
  });

  test("PAY-003 เลขบัตร 12 หลักและรหัสหลังบัตรว่าง ได้ข้อความใต้ช่องที่ผิด ไม่มีการจ่ายเงิน คำสั่งซื้อยังรอจ่ายเงิน", async () => {
    const group = addGroup("14:00");
    signInAs(group.buyerId);
    const result = await payCard(group.groupId, { ...GOOD, number: "4242 4242 4242", securityCode: "" }, "14:05");

    expect(result.state).toEqual({ errors: { number: "เลขบัตรไม่ครบ", securityCode: "กรุณากรอกรหัสหลังบัตร" } });
    expect(payments(group.groupId)).toEqual([]);
    expect(sim.charges).toEqual([]);
    expect(orderStatuses(group.groupId)).toEqual(["รอจ่ายเงิน", "รอจ่ายเงิน"]);
  });

  test("PAY-003 ช่องอื่นของแบบกรอกบัตรตรวจครบ", async () => {
    const group = addGroup("14:00");
    signInAs(group.buyerId);
    const result = await payCard(group.groupId, { number: "4242 4242 4242 4243", name: " ", expiry: "13/28", securityCode: "12a" }, "14:05");
    expect(result.state?.errors).toEqual({
      number: "เลขบัตรไม่ถูกต้อง",
      name: "กรุณากรอกชื่อบนบัตร",
      expiry: "เดือนปีหมดอายุไม่ถูกต้อง ตัวอย่าง 12/28",
      securityCode: "รหัสหลังบัตรไม่ถูกต้อง",
    });
    expect((await payCard(group.groupId, { ...GOOD, expiry: "10/26" }, "14:05")).state?.errors).toEqual({ expiry: "บัตรหมดอายุแล้ว" });
  });
});

describe("PAY-004 จ่ายด้วย PromptPay และหน้ารอผล", () => {
  test("PAY-004 เห็น QR ยอด 450 ข้อความรอผล เวลาที่เหลือ และปุ่มเช็คสถานะกับเปลี่ยนวิธีจ่าย แล้วเปลี่ยนเป็นหน้าจ่ายสำเร็จเองเมื่อรู้ผล", async () => {
    const group = addGroup("14:00");
    signInAs(group.buyerId);
    expect((await payQr(group.groupId, "14:05")).redirect).toBe(`/pay/${group.groupId}`);
    const html = await payPage(group.groupId);

    expect(html).toMatch(/<img [^>]*src="data:image\/svg\+xml/);
    for (const text of ["฿450", "กำลังรอผลการจ่ายเงิน เหลือเวลาจ่าย 25 นาที", "หน้าจัดการของ Omise", "เช็คสถานะการจ่ายเงิน", "เปลี่ยนวิธีจ่าย"]) {
      expect(html).toContain(text);
    }
    expect(getPayPage(db, group.buyerId, group.groupId)?.poll).toBe(true);

    setNow("14:08");
    sim.mark(pendingChargeId(group.groupId), "successful");
    await pollPaymentAction(group.groupId);
    expect(await payPage(group.groupId)).toContain("จ่ายเงินสำเร็จ");
    expect(orderStatuses(group.groupId)).toEqual(["จ่ายแล้ว", "จ่ายแล้ว"]);
  });

  test("PAY-004 ทำเครื่องหมายว่าไม่สำเร็จ เห็นหน้าจ่ายไม่สำเร็จพร้อมปุ่มจ่ายใหม่ คำสั่งซื้อยังรอจ่ายเงิน", async () => {
    const group = addGroup("14:00");
    signInAs(group.buyerId);
    await payQr(group.groupId, "14:05");
    setNow("14:08");
    sim.mark(pendingChargeId(group.groupId), "failed");
    await pollPaymentAction(group.groupId);

    const html = await payPage(group.groupId);
    expect(html).toContain("จ่ายเงินไม่สำเร็จ");
    expect(html).toMatch(/href="\/pay\/\d+\?retry=1"[^>]*>จ่ายใหม่</);
    expect(orderStatuses(group.groupId)).toEqual(["รอจ่ายเงิน", "รอจ่ายเงิน"]);
  });

  test("PAY-004 รูป QR โหลดไม่ขึ้น เห็นแสดง QR ไม่ได้พร้อมปุ่มลองใหม่ และเปิดหน้าซ้ำไม่สร้างการจ่ายเงินใหม่", async () => {
    const html = renderToStaticMarkup(<QrImage src={null} amount={450} />);
    expect(html).toContain("แสดง QR ไม่ได้");
    expect(html).toContain("ลองใหม่");

    const group = addGroup("14:00");
    signInAs(group.buyerId);
    await payQr(group.groupId, "14:05");
    const qr = payments(group.groupId)[0].qr_image_url;
    await payPage(group.groupId);
    await payPage(group.groupId);
    expect(payments(group.groupId).map((p) => p.qr_image_url)).toEqual([qr]);
  });
});

describe("PAY-005 จ่ายสำเร็จ", () => {
  test("PAY-005 จ่าย 450 ด้วยบัตรเวลา 14:06 คำสั่งซื้อทั้งสองเป็นจ่ายแล้ว หน้าจ่ายสำเร็จมียอด วิธีจ่าย เวลา และคำสั่งซื้อ", async () => {
    const group = addGroup("14:00");
    signInAs(group.buyerId);
    await payCard(group.groupId, GOOD, "14:06");
    const html = await payPage(group.groupId);

    expect(html).toMatch(/จ่ายแล้ว ฿450 ด้วยบัตรลงท้าย 4242 เวลา 24 พ.ย. 14:06/);
    for (const orderNo of group.orderNos) expect(html).toContain(orderNo);
    expect(orderStatuses(group.groupId)).toEqual(["จ่ายแล้ว", "จ่ายแล้ว"]);
    expect(payments(group.groupId).map((p) => p.status)).toEqual(["สำเร็จ"]);
  });

  test("PAY-005 markGroupPaid คืนคำสั่งซื้อที่เพิ่งจ่ายแล้วไว้สร้างพัสดุ และเรียกซ้ำไม่ได้ซ้ำ", () => {
    const group = addGroup("14:00");
    const payment = addPayment(db, { groupId: group.groupId });
    const first = markGroupPaid(db, payment.id, at("14:06"));
    expect(first.status).toBe("สำเร็จ");
    expect(first.paidOrderIds).toHaveLength(2);
    expect(markGroupPaid(db, payment.id, at("14:07"))).toEqual({ status: "สำเร็จ", paidOrderIds: [] });
  });

  test("PAY-005 หน้าจ่ายสำเร็จโหลดไม่ขึ้น เปิดหน้าเดิมเวลา 14:10 เห็นผลของ 14:06 และไม่มีปุ่มจ่ายซ้ำ", async () => {
    const group = addGroup("14:00");
    signInAs(group.buyerId);
    await payCard(group.groupId, GOOD, "14:06");
    setNow("14:10");
    const html = await payPage(group.groupId);

    expect(html).toContain("จ่ายแล้ว ฿450");
    expect(html).toContain("14:06");
    expect(html).not.toMatch(PAY_BUTTON);
  });
});

describe("PAY-006 จ่ายไม่สำเร็จและจ่ายใหม่", () => {
  test("PAY-006 บัตรเงินไม่พอเวลา 14:07 เห็นเหตุผลกับเวลาที่เหลือ กดจ่ายใหม่แล้วจ่ายสำเร็จ ประวัติมีสองครั้ง", async () => {
    const group = addGroup("14:00");
    signInAs(group.buyerId);
    const before = stock(group.variantIds);
    await payCard(group.groupId, LOW_FUNDS, "14:07");

    const failed = await payPage(group.groupId);
    expect(failed).toContain("บัตรถูกปฏิเสธ: วงเงินไม่พอ");
    expect(failed).toContain("เหลือเวลาจ่าย 23 นาที");
    expect(orderStatuses(group.groupId)).toEqual(["รอจ่ายเงิน", "รอจ่ายเงิน"]);
    expect(stock(group.variantIds)).toEqual(before);

    expect(await payPage(group.groupId, { retry: "1" })).toContain("เลือกวิธีจ่าย");
    await payCard(group.groupId, GOOD, "14:09");
    expect(orderStatuses(group.groupId)).toEqual(["จ่ายแล้ว", "จ่ายแล้ว"]);
    expect(payments(group.groupId).map((p) => [p.status, p.resolved_at])).toEqual([
      ["ไม่สำเร็จ", at("14:07").toISOString()],
      ["สำเร็จ", at("14:09").toISOString()],
    ]);
  });

  test("PAY-006 จ่ายไม่สำเร็จ 3 ครั้ง ถึงเวลาหมดเขต 14:30 ปุ่มจ่ายใหม่หายไปและเห็นข้อความหมดเวลา", async () => {
    const group = addGroup("14:00");
    signInAs(group.buyerId);
    for (const time of ["14:10", "14:20", "14:28"]) await payCard(group.groupId, LOW_FUNDS, time);
    setNow("14:30");
    const html = await payPage(group.groupId);

    expect(html).not.toContain("จ่ายใหม่");
    expect(html).toContain("หมดเวลาจ่ายเงิน คำสั่งซื้อถูกยกเลิก");
    expect((await payCard(group.groupId, GOOD, "14:30")).redirect).toBe(`/pay/${group.groupId}`);
    expect(payments(group.groupId)).toHaveLength(3);
  });
});

describe("PAY-007 Omise ล่มหรือตอบช้า", () => {
  test("PAY-007 Omise ล่มตอนกดจ่าย เห็นข้อความจ่ายไม่ได้ตอนนี้พร้อมเวลาที่เหลือ แล้วลองใหม่ตอน Omise กลับมาจ่ายสำเร็จ", async () => {
    const group = addGroup("14:00");
    signInAs(group.buyerId);
    sim.mode = "unavailable";
    const down = await payCard(group.groupId, GOOD, "14:06");

    expect(down.state).toEqual({
      message: "จ่ายเงินไม่ได้ตอนนี้ กรุณาลองใหม่ภายหลัง คำสั่งซื้อของคุณยังอยู่ เหลือเวลาจ่าย 24 นาที",
      retry: true,
    });
    expect(payments(group.groupId).map((p) => p.status)).toEqual(["เลิกรอ"]);
    expect(orderStatuses(group.groupId)).toEqual(["รอจ่ายเงิน", "รอจ่ายเงิน"]);

    sim.mode = "normal";
    await payCard(group.groupId, GOOD, "14:13");
    expect(orderStatuses(group.groupId)).toEqual(["จ่ายแล้ว", "จ่ายแล้ว"]);
  });

  test("PAY-007 Omise ไม่ตอบ ระบบเลิกรอเมื่อครบเวลา การจ่ายเงินเป็นเลิกรอ", async () => {
    const group = addGroup("14:00");
    sim.mode = "no-answer";
    const begin = performance.now();
    const result = await payByCard(db, sim, { buyerId: group.buyerId, groupId: group.groupId, card: GOOD }, at("14:06"), 30);

    expect(result).toEqual({ kind: "unavailable", minutesLeft: 24 });
    expect(performance.now() - begin).toBeLessThan(1000);
    expect(payments(group.groupId).map((p) => p.status)).toEqual(["เลิกรอ"]);
  });

  test("PAY-007 Omise ตัดบัตรสำเร็จหลังระบบเลิกรอไปแล้ว ระบบยังจับคู่เงินนั้นได้ คำสั่งซื้อเป็นจ่ายแล้ว", async () => {
    // คำตอบจริงของ Omise ที่มาถึงหลังหมดเวลารอ ลองกับ Omise จริงแล้วเกิดได้ (charge สำเร็จ แต่ระบบไม่รู้เลขอ้างอิง)
    const late = (async (url: string) => {
      if (url.endsWith("/tokens")) return Response.json(recorded.token);
      await new Promise((done) => setTimeout(done, 60));
      return Response.json(recorded.cardSuccessful);
    }) as typeof fetch;
    const omise = createOmiseProvider({ publicKey: "pkey_test_a", secretKey: "skey_test_b", fetch: late });
    const group = addGroup("14:00");

    const result = await payByCard(db, omise, { buyerId: group.buyerId, groupId: group.groupId, card: GOOD }, at("14:06"), 30);

    expect(result).toEqual({ kind: "unavailable", minutesLeft: 24 });
    await vi.waitFor(() => expect(payments(group.groupId).map((p) => [p.status, p.omise_charge_id])).toEqual([["สำเร็จ", recorded.cardSuccessful.id]]));
    expect(orderStatuses(group.groupId)).toEqual(["จ่ายแล้ว", "จ่ายแล้ว"]);
  });

  test("PAY-007 Omise ล่มยาวถึง 14:40 ลองใหม่กี่ครั้งก็จ่ายไม่ได้ ไม่ต่อเวลาหมดเขต และ 14:30 จ่ายไม่ได้แล้ว", async () => {
    const group = addGroup("14:00");
    signInAs(group.buyerId);
    sim.mode = "unavailable";
    for (const time of ["14:10", "14:20", "14:29"]) {
      expect((await payCard(group.groupId, GOOD, time)).state?.message).toContain("จ่ายเงินไม่ได้ตอนนี้");
    }
    expect(db.prepare("SELECT payment_deadline FROM order_groups WHERE id = ?").get(group.groupId)).toEqual({
      payment_deadline: at("14:30").toISOString(),
    });
    expect((await payCard(group.groupId, GOOD, "14:30")).redirect).toBe(`/pay/${group.groupId}`);
    expect(await payPage(group.groupId)).toContain("คำสั่งซื้อถูกยกเลิกแล้ว จ่ายเงินไม่ได้");
  });
});

describe("PAY-007 คำตอบของ Omise ที่มาหลังระบบเลิกรอ ด้วยเวลารอและเวลาตัดคำขอที่ใช้จริง", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    // นาฬิกาปลอมของ Vitest ไม่ครอบ AbortSignal.timeout
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      const cutOff = new AbortController();
      setTimeout(() => cutOff.abort(new DOMException("หมดเวลา", "TimeoutError")), ms);
      return cutOff.signal;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Omise ที่ตอบคำขอตัดเงินหลังผ่านไป afterMs และเลิกทำเมื่อคำขอถูกตัด เหมือน fetch จริง */
  function slowOmise(afterMs: number, answer: () => Response = () => new Response(null, { status: 599 })) {
    const charging = Promise.withResolvers<AbortSignal>();
    const send = (async (url: string, init: RequestInit) => {
      if (url.endsWith("/tokens")) return Response.json(recorded.token);
      const signal = init.signal!;
      charging.resolve(signal);
      return new Promise<Response>((resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason));
        setTimeout(() => resolve(answer()), afterMs);
      });
    }) as typeof fetch;
    return { omise: createOmiseProvider({ publicKey: "pkey_test_a", secretKey: "skey_test_b", fetch: send }), charging: charging.promise };
  }

  /** กดจ่ายด้วยบัตรตอนเวลา time แล้วเดินนาฬิกาจนระบบเลิกรอ */
  async function payAndGiveUp(slow: ReturnType<typeof slowOmise>, time: string) {
    const group = addGroup("14:00");
    const paying = payByCard(db, slow.omise, { buyerId: group.buyerId, groupId: group.groupId, card: GOOD }, setNow(time));
    await slow.charging;
    await vi.advanceTimersByTimeAsync(PROVIDER_TIMEOUT_MS);
    expect((await paying).kind).toBe("unavailable");
    expect(payments(group.groupId).map((p) => [p.status, p.omise_charge_id])).toEqual([["เลิกรอ", null]]);
    return group;
  }

  const outcome = (groupId: number) =>
    db.prepare("SELECT status, omise_charge_id, failure_reason, resolved_at FROM payments WHERE group_id = ?").all(groupId);

  test("PAY-007 Omise ตัดบัตรสำเร็จแต่ตอบวินาทีที่ 12 ระบบเลิกรอที่วินาทีที่ 10 แล้วยังได้คำตอบนั้น การจ่ายเงินเป็นสำเร็จ", async () => {
    const group = await payAndGiveUp(slowOmise(12_000, () => Response.json(recorded.cardSuccessful)), "14:06");

    await vi.advanceTimersByTimeAsync(2_000);
    await vi.waitFor(() =>
      expect(outcome(group.groupId)).toEqual([
        { status: "สำเร็จ", omise_charge_id: recorded.cardSuccessful.id, failure_reason: null, resolved_at: at("14:06:12").toISOString() },
      ]),
    );
    expect(orderStatuses(group.groupId)).toEqual(["จ่ายแล้ว", "จ่ายแล้ว"]);
  });

  test("PAY-007 คำตอบที่มาช้าบอกว่า Omise ไม่รับรายการ การจ่ายเงินเปลี่ยนจากเลิกรอเป็นไม่สำเร็จพร้อมเหตุผล", async () => {
    const rejected = () => Response.json({ object: "error", code: "invalid_card", message: "number is invalid" }, { status: 400 });
    const group = await payAndGiveUp(slowOmise(12_000, rejected), "14:06");

    await vi.advanceTimersByTimeAsync(2_000);
    await vi.waitFor(() =>
      expect(outcome(group.groupId)).toEqual([
        {
          status: "ไม่สำเร็จ",
          omise_charge_id: null,
          failure_reason: "บัตรถูกปฏิเสธ: ข้อมูลบัตรไม่ถูกต้อง หรือไม่ใช่บัตรทดลองของ Omise",
          resolved_at: at("14:06:12").toISOString(),
        },
      ]),
    );
    expect(orderStatuses(group.groupId)).toEqual(["รอจ่ายเงิน", "รอจ่ายเงิน"]);
  });

  test("PAY-007 PAY-010 กดจ่าย 14:29:55 คำตอบว่าสำเร็จมาถึง 14:30:07 หลังหมดเขตจ่าย เงินนั้นเป็นสำเร็จแต่ไม่ถูกใช้ และมีเลขอ้างอิงไว้คืนเงิน", async () => {
    const group = await payAndGiveUp(slowOmise(12_000, () => Response.json(recorded.cardSuccessful)), "14:29:55");

    await vi.advanceTimersByTimeAsync(2_000);
    await vi.waitFor(() =>
      expect(outcome(group.groupId)).toEqual([
        { status: "สำเร็จแต่ไม่ถูกใช้", omise_charge_id: recorded.cardSuccessful.id, failure_reason: null, resolved_at: at("14:30:07").toISOString() },
      ]),
    );
    expect(orderStatuses(group.groupId)).toEqual(["รอจ่ายเงิน", "รอจ่ายเงิน"]);
  });

  test("PAY-007 Omise ไม่ตอบเลย คำขอตัดเงินถูกตัดเมื่อครบเวลารอบวกเวลาเผื่อ การจ่ายเงินยังเป็นเลิกรอ และจ่ายใหม่ได้", async () => {
    const slow = slowOmise(3_600_000);
    const group = await payAndGiveUp(slow, "14:06");
    const signal = await slow.charging;

    await vi.advanceTimersByTimeAsync(LATE_ANSWER_MARGIN_MS - 1);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal.aborted).toBe(true);

    expect(payments(group.groupId).map((p) => [p.status, p.omise_charge_id])).toEqual([["เลิกรอ", null]]);
    await payByCard(db, sim, { buyerId: group.buyerId, groupId: group.groupId, card: GOOD }, at("14:07"));
    expect(orderStatuses(group.groupId)).toEqual(["จ่ายแล้ว", "จ่ายแล้ว"]);
  });
});

describe("PAY-008 เช็คสถานะการจ่ายเงิน", () => {
  test("PAY-008 ทำเครื่องหมายสำเร็จแล้วแต่ Omise ไม่แจ้งกลับ กดเช็คสถานะเวลา 14:09 ได้หน้าจ่ายสำเร็จ", async () => {
    const group = addGroup("14:00");
    signInAs(group.buyerId);
    await payQr(group.groupId, "14:05");
    sim.mark(pendingChargeId(group.groupId), "successful");
    setNow("14:09");

    expect((await submit(checkStatusAction(form({ groupId: group.groupId })))).redirect).toBe(`/pay/${group.groupId}`);
    expect(await payPage(group.groupId)).toContain("จ่ายแล้ว ฿450");
    expect(orderStatuses(group.groupId)).toEqual(["จ่ายแล้ว", "จ่ายแล้ว"]);
  });

  test("PAY-008 ยังไม่มีผล เห็นยังไม่ได้รับเงินพร้อมเวลาที่เช็คล่าสุด และยังอยู่หน้ารอผลกับ QR เดิม", async () => {
    const group = addGroup("14:00");
    signInAs(group.buyerId);
    await payQr(group.groupId, "14:05");
    setNow("14:07");

    expect((await submit(checkStatusAction(form({ groupId: group.groupId })))).state).toEqual({
      message: "ยังไม่ได้รับเงิน เช็คล่าสุด 24 พ.ย. 14:07",
    });
    expect(await payPage(group.groupId)).toContain(payments(group.groupId)[0].qr_image_url?.slice(0, 30));
  });

  test("PAY-008 Omise ล่มตอนเช็ค เห็นเช็คสถานะไม่ได้ตอนนี้ การจ่ายเงินยังรอผล QR เดิมยังอยู่", async () => {
    const group = addGroup("14:00");
    signInAs(group.buyerId);
    await payQr(group.groupId, "14:05");
    sim.mode = "unavailable";
    setNow("14:07");

    expect((await submit(checkStatusAction(form({ groupId: group.groupId })))).state).toEqual({
      message: "เช็คสถานะไม่ได้ตอนนี้ กรุณาลองใหม่",
    });
    expect(payments(group.groupId).map((p) => p.status)).toEqual(["รอผล"]);
    expect(await payPage(group.groupId)).toMatch(/<img [^>]*src="data:image/);
    expect(orderStatuses(group.groupId)).toEqual(["รอจ่ายเงิน", "รอจ่ายเงิน"]);
  });

  test("PAY-008 Omise ไม่ตอบตอนเช็ค ได้ผลภายในเวลาที่กำหนด", async () => {
    const group = addGroup("14:00");
    await payByPromptPay(db, sim, { buyerId: group.buyerId, groupId: group.groupId }, at("14:05"));
    sim.mode = "no-answer";
    expect(await checkPaymentStatus(db, sim, { buyerId: group.buyerId, groupId: group.groupId }, at("14:07"), 30)).toEqual({ kind: "error" });
  });
});

describe("PAY-009 กันกดซ้ำและจ่ายซ้ำ", () => {
  test("PAY-009 กดจ่ายเงินสองครั้งติดกัน บัตรถูกตัดครั้งเดียว มีการจ่ายเงินสำเร็จรายการเดียว", async () => {
    const group = addGroup("14:00");
    signInAs(group.buyerId);
    setNow("14:06");
    const results = await Promise.all([1, 2].map(() => submit(payByCardAction(cardForm(group.groupId, GOOD)))));

    expect(sim.charges).toHaveLength(1);
    expect(payments(group.groupId).map((p) => p.status)).toEqual(["สำเร็จ"]);
    expect(results.every((r) => r.redirect?.startsWith(`/pay/${group.groupId}`))).toBe(true);
  });

  test("PAY-009 สองหน้าจอพร้อมกัน รับเฉพาะครั้งแรก อีกหน้าจอเห็นว่ามีการจ่ายเงินที่กำลังรอผลอยู่", async () => {
    const group = addGroup("14:00");
    signInAs(group.buyerId);
    await payQr(group.groupId, "14:06");
    const second = await payCard(group.groupId, GOOD, "14:06");

    expect(second.redirect).toBe(`/pay/${group.groupId}?notice=pending`);
    const html = await payPage(group.groupId, { notice: "pending" });
    expect(html).toContain("มีการจ่ายเงินที่กำลังรอผลอยู่");
    expect(html).toMatch(/<img [^>]*src="data:image/);
    expect(payments(group.groupId)).toHaveLength(1);
    expect(sim.charges).toHaveLength(1);
  });

  test("PAY-009 จ่ายสำเร็จบนมือถือแล้ว กดจ่ายบนคอมพิวเตอร์เวลา 14:15 เห็นว่าจ่ายเงินแล้ว และบัตรไม่ถูกตัดอีก", async () => {
    const group = addGroup("14:00");
    signInAs(group.buyerId);
    await payCard(group.groupId, GOOD, "14:06");
    const again = await payCard(group.groupId, GOOD, "14:15");

    expect(again.redirect).toBe(`/pay/${group.groupId}?notice=paid`);
    const html = await payPage(group.groupId, { notice: "paid" });
    expect(html).toContain("คำสั่งซื้อนี้จ่ายเงินแล้ว");
    expect(html).toContain("14:06");
    expect(sim.charges).toHaveLength(1);
  });
});

describe("PAY-010 ผลจ่ายสำเร็จที่ใช้ไม่ได้แล้ว", () => {
  test("PAY-010 ทำเครื่องหมายสำเร็จหลังคำสั่งซื้อถูกยกเลิกเพราะหมดเขต เงินนั้นไม่ถูกใช้ และคำสั่งซื้อยังยกเลิก", async () => {
    const group = addGroup("14:00");
    signInAs(group.buyerId);
    await payQr(group.groupId, "14:25");
    setNow("14:30");
    cancelForDeadline(group.groupId);
    const before = stock(group.variantIds);
    setNow("14:33");
    sim.mark(payments(group.groupId)[0].omise_charge_id ?? "", "successful");
    await pollPaymentAction(group.groupId);

    expect(orderStatuses(group.groupId)).toEqual(["ยกเลิก", "ยกเลิก"]);
    expect(stock(group.variantIds)).toEqual(before);
    expect(payments(group.groupId).map((p) => p.status)).toEqual(["สำเร็จแต่ไม่ถูกใช้"]);
    setNow("14:35");
    const html = await payPage(group.groupId);
    expect(html).toContain("ได้รับเงินทดลองหลังคำสั่งซื้อปิดไปแล้ว เงินจำนวนนี้ไม่ถูกใช้");
    expect(html).toContain("PromptPay ฿450 สำเร็จแต่ไม่ถูกใช้");
  });

  test("PAY-010 ผลสำเร็จมาถึงหลังหมดเขตจ่าย แม้ตัวยกเลิกยังไม่ได้เปลี่ยนสถานะคำสั่งซื้อ เงินนั้นไม่ถูกใช้", async () => {
    const group = addGroup("14:00");
    await payByPromptPay(db, sim, { buyerId: group.buyerId, groupId: group.groupId }, at("14:25"));
    sim.mark(pendingChargeId(group.groupId), "successful");
    await syncGroupPayments(db, sim, { buyerId: group.buyerId, groupId: group.groupId }, at("14:30:01"));

    expect(payments(group.groupId).map((p) => p.status)).toEqual(["สำเร็จแต่ไม่ถูกใช้"]);
    expect(orderStatuses(group.groupId)).toEqual(["รอจ่ายเงิน", "รอจ่ายเงิน"]);
  });

  test("PAY-010 เปลี่ยนไปจ่ายด้วยบัตรสำเร็จแล้ว QR เดิมสำเร็จทีหลัง QR นั้นไม่ถูกใช้ และคำสั่งซื้อไม่ถูกจ่ายซ้ำ", async () => {
    const group = addGroup("14:00");
    signInAs(group.buyerId);
    await payQr(group.groupId, "14:05");
    const qrCharge = pendingChargeId(group.groupId);
    await submit(changeMethodAction(form({ groupId: group.groupId })));
    await payCard(group.groupId, GOOD, "14:10");
    setNow("14:12");
    sim.mark(qrCharge, "successful");
    await pollPaymentAction(group.groupId);

    expect(payments(group.groupId).map((p) => [p.method, p.status])).toEqual([
      ["PromptPay", "สำเร็จแต่ไม่ถูกใช้"],
      ["บัตร", "สำเร็จ"],
    ]);
    expect(db.prepare("SELECT DISTINCT status, paid_at FROM orders WHERE group_id = ?").all(group.groupId)).toEqual([
      { status: "จ่ายแล้ว", paid_at: at("14:10").toISOString() },
    ]);
  });
});

describe("PAY-010 ตัดสินด้วยเวลาที่ได้คำตอบจาก Omise", () => {
  /** ตัวจำลองที่ตอบตอนเวลา answeredAt แทนที่จะตอบทันที */
  const answersAt = (answeredAt: string) => ({
    ...sim,
    kind: "simulator" as const,
    chargeCard: async (input: Parameters<Simulator["chargeCard"]>[0]) => {
      const charge = await sim.chargeCard(input);
      setNow(answeredAt);
      return charge;
    },
  });

  test("PAY-010 กดจ่ายด้วยบัตร 14:29:55 แต่ Omise ตอบว่าสำเร็จ 14:30:03 หลังหมดเขต เงินนั้นไม่ถูกใช้", async () => {
    const group = addGroup("14:00");
    setNow("14:29:55");
    const result = await payByCard(db, answersAt("14:30:03"), { buyerId: group.buyerId, groupId: group.groupId, card: GOOD }, at("14:29:55"));

    expect(result).toEqual({ kind: "done", status: "สำเร็จแต่ไม่ถูกใช้" });
    expect(orderStatuses(group.groupId)).toEqual(["รอจ่ายเงิน", "รอจ่ายเงิน"]);
    expect(db.prepare("SELECT COUNT(*) AS n FROM parcels").get()).toEqual({ n: 0 });
  });

  test("PAY-010 กดจ่าย 14:29:50 Omise ตอบ 14:29:58 ก่อนหมดเขต คำสั่งซื้อจ่ายแล้วตามเวลาที่ได้คำตอบ", async () => {
    const group = addGroup("14:00");
    setNow("14:29:50");
    await payByCard(db, answersAt("14:29:58"), { buyerId: group.buyerId, groupId: group.groupId, card: GOOD }, at("14:29:50"));

    expect(db.prepare("SELECT DISTINCT status, paid_at FROM orders WHERE group_id = ?").all(group.groupId)).toEqual([
      { status: "จ่ายแล้ว", paid_at: at("14:29:58").toISOString() },
    ]);
  });
});

describe("ปุ่มของตัวจำลองการจ่ายเงิน", () => {
  test("เฉพาะผู้ดูแลแพลตฟอร์มเปลี่ยนโหมดของตัวจำลองได้ ผู้ซื้อส่งคำขอเองแล้วโหมดไม่เปลี่ยน", async () => {
    const group = addGroup("14:00");
    signInAs(group.buyerId);
    expect((await submit(setSimulatorModeAction(form({ groupId: group.groupId, mode: "unavailable" })))).redirect).toBe(
      `/pay/${group.groupId}`,
    );
    expect(sim.mode).toBe("normal");

    signInAs(addAccount(db, { isAdmin: true }).id);
    await submit(setSimulatorModeAction(form({ groupId: group.groupId, mode: "unavailable" })));
    expect(sim.mode).toBe("unavailable");
    await submit(setSimulatorModeAction(form({ groupId: group.groupId, mode: "พัง" })));
    expect(sim.mode).toBe("unavailable");
  });

  test("หน้าจ่ายเงินแสดงปุ่มเปลี่ยนโหมดให้ผู้ดูแลแพลตฟอร์มเท่านั้น ผู้ซื้อเห็นแค่โหมดที่ใช้อยู่", async () => {
    const buyer = addGroup("14:00");
    signInAs(buyer.buyerId);
    const buyerHtml = await payPage(buyer.groupId);
    expect(buyerHtml).toContain("ตัวจำลองการจ่ายเงิน");
    expect(buyerHtml).toContain("โหมดที่ใช้อยู่: Omise ตอบปกติ");
    expect(buyerHtml).not.toMatch(/<button[^>]*name="mode"/);

    const admin = addAccount(db, { isAdmin: true });
    const adminGroup = addOrder(db, { buyerAccountId: admin.id, items: [{ variantId: addProduct(db, { price: 100 }).variantIds[0] }], orderedAt: at("14:00").toISOString() });
    signInAs(admin.id);
    expect(await payPage(adminGroup.groupId)).toMatch(/<button[^>]*value="unavailable"[^>]*name="mode"/);
  });

  test("ผู้ซื้อทำเครื่องหมายผล PromptPay ที่รอผลของกลุ่มตัวเองได้ แต่ของกลุ่มคนอื่นไม่ได้", async () => {
    const mine = addGroup("14:00");
    const other = addGroup("14:00");
    signInAs(other.buyerId);
    await payQr(other.groupId, "14:05");
    signInAs(mine.buyerId);
    await payQr(mine.groupId, "14:05");

    await submit(markSimulatorChargeAction(form({ groupId: mine.groupId, chargeId: pendingChargeId(other.groupId), result: "successful" })));
    expect(sim.find(pendingChargeId(other.groupId))?.status).toBe("pending");

    await submit(markSimulatorChargeAction(form({ groupId: mine.groupId, chargeId: pendingChargeId(mine.groupId), result: "successful" })));
    expect(sim.find(payments(mine.groupId)[0].omise_charge_id ?? "")?.status).toBe("successful");
  });

  test("ใส่กุญแจ Omise แล้ว ปุ่มของตัวจำลองไม่ขึ้น และส่งคำขอเองก็ทำเครื่องหมายผลหรือเปลี่ยนโหมดไม่ได้", async () => {
    const group = addGroup("14:00");
    signInAs(group.buyerId);
    await payQr(group.groupId, "14:05");
    const chargeId = pendingChargeId(group.groupId);
    request.provider = { kind: "omise", chargeCard: sim.chargeCard, chargePromptPay: sim.chargePromptPay, retrieveCharge: sim.retrieveCharge };
    signInAs(addAccount(db, { isAdmin: true }).id);
    await submit(setSimulatorModeAction(form({ groupId: group.groupId, mode: "unavailable" })));
    signInAs(group.buyerId);

    expect((await submit(markSimulatorChargeAction(form({ groupId: group.groupId, chargeId, result: "successful" })))).redirect).toBe(
      `/pay/${group.groupId}`,
    );
    expect(sim.find(chargeId)?.status).toBe("pending");
    expect(sim.mode).toBe("normal");
    expect(await payPage(group.groupId)).not.toContain("ตัวจำลองการจ่ายเงิน");
  });
});

describe("PAY-011 ปิดหน้ากลางทางแล้วกลับมา", () => {
  test("PAY-011 เปิด QR เวลา 14:05 แล้วกลับมากดจ่ายเงินเวลา 14:15 เห็น QR เดิม เวลาที่เหลือ 15 นาที และการจ่ายเงินรอผลรายการเดียว", async () => {
    const group = addGroup("14:00");
    signInAs(group.buyerId);
    await payQr(group.groupId, "14:05");
    const qr = payments(group.groupId)[0].qr_image_url ?? "";
    setNow("14:15");
    const html = await payPage(group.groupId);

    expect(html).toContain(qr.slice(0, 60));
    expect(html).toContain("เหลือเวลาจ่าย 15 นาที");
    expect(payments(group.groupId).map((p) => p.status)).toEqual(["รอผล"]);
  });

  test("PAY-011 กรอกบัตรไปครึ่งหนึ่งแล้วปิดหน้า กลับมาเวลา 14:20 แบบกรอกบัตรว่าง ไม่มีการจ่ายเงิน และเหลือเวลา 10 นาที", async () => {
    const group = addGroup("14:00");
    signInAs(group.buyerId);
    setNow("14:20");
    const html = await payPage(group.groupId, { method: "card" });

    for (const input of html.match(/<input [^>]*name="(number|name|expiry|securityCode)"[^>]*>/g) ?? []) {
      expect(input).not.toMatch(/value="/);
    }
    expect(html.match(/<input [^>]*name="(number|name|expiry|securityCode)"/g)).toHaveLength(4);
    expect(html).toContain("เหลือเวลาจ่าย 10 นาที");
    expect(payments(group.groupId)).toEqual([]);
  });
});

describe("PAY-012 เลิกรอและเปลี่ยนวิธีจ่าย", () => {
  test("PAY-012 กดเปลี่ยนวิธีจ่ายแล้วยืนยันเวลา 14:10 การจ่ายเงินเดิมเลิกรอ กลับไปหน้าจ่ายเงิน เหลือเวลา 20 นาที", async () => {
    const group = addGroup("14:00");
    signInAs(group.buyerId);
    await payQr(group.groupId, "14:05");
    expect(await payPage(group.groupId)).toContain("เลิกใช้ QR นี้ใช่ไหม");
    setNow("14:10");

    expect((await submit(changeMethodAction(form({ groupId: group.groupId })))).redirect).toBe(`/pay/${group.groupId}`);
    expect(payments(group.groupId).map((p) => p.status)).toEqual(["เลิกรอ"]);
    const html = await payPage(group.groupId);
    expect(html).toContain("เลือกวิธีจ่าย");
    expect(html).toContain("เหลือเวลาจ่าย 20 นาที");
    expect(orderStatuses(group.groupId)).toEqual(["รอจ่ายเงิน", "รอจ่ายเงิน"]);
  });

  test("PAY-012 เลิกรอ QR แล้ว แต่ QR เดิมสำเร็จเวลา 14:11 ก่อนจ่ายด้วยวิธีใหม่ ระบบรับเงินนั้นและเห็นหน้าจ่ายสำเร็จ", async () => {
    const group = addGroup("14:00");
    signInAs(group.buyerId);
    await payQr(group.groupId, "14:05");
    const qrCharge = pendingChargeId(group.groupId);
    setNow("14:10");
    await submit(changeMethodAction(form({ groupId: group.groupId })));
    setNow("14:11");
    sim.mark(qrCharge, "successful");
    await pollPaymentAction(group.groupId);

    expect(payments(group.groupId).map((p) => p.status)).toEqual(["สำเร็จ"]);
    expect(orderStatuses(group.groupId)).toEqual(["จ่ายแล้ว", "จ่ายแล้ว"]);
    expect(await payPage(group.groupId)).toContain("จ่ายแล้ว ฿450 ด้วย PromptPay");
  });
});

describe("PAY-013 หมดเวลาระหว่างจ่าย", () => {
  test("PAY-013 หน้ารอผลเปิดค้าง ถึง 14:30 คำสั่งซื้อถูกยกเลิก QR หายไป การจ่ายเงินเลิกรอ และมีทางไปหน้าคำสั่งซื้อ", async () => {
    const group = addGroup("14:00");
    signInAs(group.buyerId);
    await payQr(group.groupId, "14:25");
    setNow("14:30");
    cancelForDeadline(group.groupId);
    setNow("14:30:03");
    await pollPaymentAction(group.groupId);

    expect(payments(group.groupId).map((p) => p.status)).toEqual(["เลิกรอ"]);
    const html = await payPage(group.groupId);
    expect(html).toContain("คำสั่งซื้อถูกยกเลิกแล้ว จ่ายเงินไม่ได้");
    expect(html).not.toMatch(/<img /);
    expect(html).toContain('href="/orders"');
  });

  test("PAY-013 ตัวยกเลิกคำสั่งซื้อเรียก abandonPendingPayments แล้วการจ่ายเงินที่รอผลเป็นเลิกรอทันที", async () => {
    const group = addGroup("14:00");
    await payByPromptPay(db, sim, { buyerId: group.buyerId, groupId: group.groupId }, at("14:25"));
    expect(abandonPendingPayments(db, group.groupId)).toBe(1);
    expect(payments(group.groupId).map((p) => p.status)).toEqual(["เลิกรอ"]);
  });

  test("PAY-013 เน็ตหลุดแล้วกดจ่ายเงินเวลา 14:31 เห็นว่าคำสั่งซื้อถูกยกเลิกแล้ว บัตรไม่ถูกตัด และไม่มีการจ่ายเงิน", async () => {
    const group = addGroup("14:00");
    signInAs(group.buyerId);
    setNow("14:30");
    cancelForDeadline(group.groupId);
    const result = await payCard(group.groupId, GOOD, "14:31");

    expect(result.redirect).toBe(`/pay/${group.groupId}`);
    expect(await payPage(group.groupId)).toContain("คำสั่งซื้อถูกยกเลิกแล้ว จ่ายเงินไม่ได้");
    expect(sim.charges).toEqual([]);
    expect(payments(group.groupId)).toEqual([]);
  });
});

describe("PAY-014 สิทธิ์เข้าหน้าจ่ายเงิน", () => {
  test("PAY-014 ยังไม่ได้เข้าสู่ระบบ ถูกพาไปหน้าเข้าสู่ระบบ แล้วกลับมาเห็นหน้าจ่ายเงินของตัวเอง", async () => {
    const group = addGroup("14:00");
    setNow("14:05");
    const first = await open(PayPage({ params: Promise.resolve({ groupId: String(group.groupId) }), searchParams: Promise.resolve({}) }));

    expect(first.redirect).toBe(`/login?next=${encodeURIComponent(`/pay/${group.groupId}`)}`);
    signInAs(group.buyerId);
    expect(await payPage(group.groupId)).toContain("ยอดที่ต้องจ่าย ฿450");
  });

  test("PAY-014 ผู้ขายของร้านในกลุ่มเปิดลิงก์ของผู้ซื้อ เห็นไม่พบหน้านี้ ไม่เห็นยอด และจ่ายแทนไม่ได้", async () => {
    const group = addGroup("14:00");
    signInAs(group.coffee.ownerAccountId);
    setNow("14:05");

    const result = await open(PayPage({ params: Promise.resolve({ groupId: String(group.groupId) }), searchParams: Promise.resolve({}) }));
    expect(result).toEqual({ redirect: "not-found" });
    const notFound = renderToStaticMarkup(<PayNotFound />);
    expect(notFound).toContain("ไม่พบหน้านี้");
    expect(notFound).not.toContain("฿");
    await payCard(group.groupId, GOOD, "14:05");
    await payQr(group.groupId, "14:05");
    expect(payments(group.groupId)).toEqual([]);
    expect(sim.charges).toEqual([]);
  });
});

describe("PAY-015 ผลที่มาซ้ำหรือไม่ตรง", () => {
  test("PAY-015 ผลจ่ายสำเร็จของรายการเดิมมาซ้ำเวลา 14:09 ไม่เปลี่ยนอะไร ยังมีการจ่ายเงินสำเร็จรายการเดียวเวลา 14:08", async () => {
    const group = addGroup("14:00");
    await payByPromptPay(db, sim, { buyerId: group.buyerId, groupId: group.groupId }, at("14:05"));
    const chargeId = pendingChargeId(group.groupId);
    sim.mark(chargeId, "successful");
    expect(await handleChargeNotification(db, sim, { chargeId, amount: 450 }, at("14:08"))).toBe("applied");
    expect(await handleChargeNotification(db, sim, { chargeId, amount: 450 }, at("14:09"))).toBe("already-used");

    expect(payments(group.groupId).map((p) => [p.status, p.resolved_at])).toEqual([["สำเร็จ", at("14:08").toISOString()]]);
    expect(orderStatuses(group.groupId)).toEqual(["จ่ายแล้ว", "จ่ายแล้ว"]);
  });

  test("PAY-015 ผลที่ยอดไม่ตรง ผลที่ Omise ยังไม่ยืนยัน และผลของรายการที่ไม่รู้จัก ไม่เปลี่ยนอะไร", async () => {
    const group = addGroup("14:00");
    await payByPromptPay(db, sim, { buyerId: group.buyerId, groupId: group.groupId }, at("14:05"));
    const chargeId = pendingChargeId(group.groupId);

    expect(await handleChargeNotification(db, sim, { chargeId, amount: 45 }, at("14:07"))).toBe("amount-mismatch");
    expect(await handleChargeNotification(db, sim, { chargeId, amount: 450 }, at("14:07"))).toBe("applied");
    expect(await handleChargeNotification(db, sim, { chargeId: "chrg_test_unknown" }, at("14:07"))).toBe("unknown");
    // ถามกลับแล้วได้ยอดที่ไม่ตรงกับการจ่ายเงินนี้ ก็ไม่ใช้
    const wrongAmount = { ...sim, retrieveCharge: async (id: string) => ({ ...(await sim.retrieveCharge(id)), status: "successful" as const, amount: 45 }) };
    expect(await checkPaymentStatus(db, wrongAmount, { buyerId: group.buyerId, groupId: group.groupId }, at("14:07"))).toMatchObject({
      kind: "still-pending",
    });
    expect(payments(group.groupId).map((p) => p.status)).toEqual(["รอผล"]);
    expect(orderStatuses(group.groupId)).toEqual(["รอจ่ายเงิน", "รอจ่ายเงิน"]);
  });

  test("PAY-015 webhook ที่ Omise ส่งมาถูกถามกลับก่อนใช้ และของที่ไม่ใช่เหตุการณ์ของ charge ไม่ทำอะไร", async () => {
    const group = addGroup("14:00");
    await payByPromptPay(db, sim, { buyerId: group.buyerId, groupId: group.groupId }, at("14:05"));
    const chargeId = pendingChargeId(group.groupId);
    const post = (body: unknown) => webhook(new Request("http://localhost/pay/omise-webhook", { method: "POST", body: JSON.stringify(body) }));
    setNow("14:08");

    expect(await (await post({ object: "event", key: "charge.complete", data: { id: chargeId, amount: 4500 } })).json()).toEqual({
      result: "amount-mismatch",
    });
    expect(await (await post({ hello: "world" })).json()).toEqual({ result: "ignored" });
    sim.mark(chargeId, "successful");
    expect(await (await post({ object: "event", key: "charge.complete", data: { id: chargeId, amount: 45000 } })).json()).toEqual({
      result: "applied",
    });
    expect(orderStatuses(group.groupId)).toEqual(["จ่ายแล้ว", "จ่ายแล้ว"]);
  });
});

describe("PAY-Q01 ความเร็วแสดงผล", () => {
  test("PAY-Q01 กับข้อมูล 50 ร้าน 1,000 สินค้า เปิดหน้าจ่ายเงิน 100 ครั้ง 95 ครั้งเร็วกว่า 2 วินาที", async () => {
    for (let s = 0; s < 50; s++) {
      const shop = addShop(db);
      for (let p = 0; p < 20; p++) addProduct(db, { shopId: shop.id });
    }
    const group = addGroup("14:00");
    signInAs(group.buyerId);
    setNow("14:05");
    const times: number[] = [];
    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      await payPage(group.groupId);
      times.push(performance.now() - start);
    }
    expect(times.sort((a, b) => a - b)[94]).toBeLessThan(2000);
  });
});

describe("PAY-Q02 เวลารอ Omise", () => {
  test("PAY-Q02 ระบบเลิกรอ Omise ที่ 10 วินาที และหน้าเว็บรอไม่เกิน 11 วินาที", () => {
    expect(PROVIDER_TIMEOUT_MS).toBe(10_000);
    expect(CLIENT_TIMEOUT_MS).toBeLessThanOrEqual(11_000);
    expect(CLIENT_TIMEOUT_MS).toBeGreaterThan(PROVIDER_TIMEOUT_MS);
  });

  test("PAY-Q02 Omise ไม่ตอบ 20 ครั้ง ทุกครั้งได้ผลจ่ายเงินไม่ได้ตอนนี้ภายในเวลาที่ตั้ง", async () => {
    sim.mode = "no-answer";
    for (let i = 0; i < 20; i++) {
      const group = addGroup("14:00");
      const begin = performance.now();
      const result = await payByCard(db, sim, { buyerId: group.buyerId, groupId: group.groupId, card: GOOD }, at("14:05"), 20);
      expect(result.kind).toBe("unavailable");
      expect(performance.now() - begin).toBeLessThan(500);
    }
  });
});

describe("PAY-Q03 หน้าจอเปลี่ยนเองเมื่อรู้ผล", () => {
  test("PAY-Q03 หน้ารอผลถามผลซ้ำทุก 3 วินาที จึงเปลี่ยนเป็นหน้าผลภายใน 5 วินาที", async () => {
    expect(POLL_INTERVAL_MS).toBeLessThanOrEqual(3_000);
    const group = addGroup("14:00");
    await payByPromptPay(db, sim, { buyerId: group.buyerId, groupId: group.groupId }, at("14:05"));
    expect(getPayPage(db, group.buyerId, group.groupId, at("14:05"))?.poll).toBe(true);
    sim.mark(pendingChargeId(group.groupId), "successful");
    await syncGroupPayments(db, sim, { buyerId: group.buyerId, groupId: group.groupId }, at("14:06"));
    expect(getPayPage(db, group.buyerId, group.groupId, at("14:06"))).toMatchObject({ view: "paid", poll: false });
  });
});

describe("PAY-Q04 ไม่ตัดเงินซ้ำ", () => {
  test("PAY-Q04 กดจ่ายเงินพร้อมกัน 20 ครั้ง 10 รอบ ได้การจ่ายเงิน 1 รายการและตัดบัตร 1 ครั้งทุกรอบ", async () => {
    for (let round = 0; round < 10; round++) {
      const group = addGroup("14:00");
      const provider = createSimulator();
      await Promise.all(
        Array.from({ length: 20 }, () => payByCard(db, provider, { buyerId: group.buyerId, groupId: group.groupId, card: GOOD }, at("14:06"))),
      );
      expect(payments(group.groupId)).toHaveLength(1);
      expect(provider.charges).toHaveLength(1);
      expect(orderStatuses(group.groupId)).toEqual(["จ่ายแล้ว", "จ่ายแล้ว"]);
    }
  });
});

describe("PAY-Q05 ผู้ใช้พร้อมกัน", () => {
  test("PAY-Q05 ผู้ซื้อ 20 คนจ่ายพร้อมกันคนละกลุ่ม ทุกคนได้ผลถูกต้องตรงกับตัวจำลอง", async () => {
    const groups = Array.from({ length: 20 }, () => addGroup("14:00"));
    await Promise.all(
      groups.map((group, i) =>
        i % 2 === 0
          ? payByCard(db, sim, { buyerId: group.buyerId, groupId: group.groupId, card: GOOD }, at("14:06"))
          : payByPromptPay(db, sim, { buyerId: group.buyerId, groupId: group.groupId }, at("14:06")),
      ),
    );
    for (const [i, group] of groups.entries()) {
      const [payment] = payments(group.groupId);
      expect(payment.status).toBe(i % 2 === 0 ? "สำเร็จ" : "รอผล");
      expect(sim.find(payment.omise_charge_id ?? "")?.amount).toBe(450);
    }
  });
});

describe("PAY-Q06 ข้อมูลบัตร", () => {
  test("PAY-Q06 จ่ายด้วยบัตร 20 ครั้ง เลขบัตรเต็มและรหัสหลังบัตรไม่อยู่ในหน้าใด ไม่อยู่ในฐานข้อมูล และไม่อยู่ในผลที่ส่งกลับ", async () => {
    // ใช้บัตร Mastercard ทดลองที่ส่วนตัวจำลองไม่ได้พิมพ์ไว้ในหน้า
    const cards = [
      { ...GOOD, number: "5555 5555 5555 4444", securityCode: "987" },
      { ...GOOD, number: "5555 5511 1111 0011", securityCode: "987" },
    ];
    const fullNumber = /5555\s?5555\s?5555\s?4444|5555\s?5511\s?1111\s?0011/;
    for (let i = 0; i < 20; i++) {
      const group = addGroup("14:00");
      signInAs(group.buyerId);
      const result = await payCard(group.groupId, cards[i % 2], "14:06");
      const pages = [await payPage(group.groupId), await payPage(group.groupId, { method: "card" }), JSON.stringify(result)];
      for (const html of pages) {
        expect(html).not.toMatch(fullNumber);
        expect(html).not.toContain("987");
      }
    }
    expect(payments(1).length + payments(20).length).toBe(2);
    // เลขอ้างอิงของ Omise เป็นเลขสุ่ม จึงไม่นับรวม ไม่เช่นนั้นจะเจอ 987 ได้โดยบังเอิญ
    const stored = JSON.stringify(
      db.prepare("SELECT id, group_id, amount, method, status, failure_reason, card_last4, qr_image_url, started_at, resolved_at FROM payments").all(),
    );
    expect(stored).not.toMatch(/5555555555554444|5555551111110011|987/);
    expect(stored).toContain('"card_last4":"4444"');
  });
});

describe("PAY-Q07 เครื่องหมายเงินทดลองเห็นชัด", () => {
  test("PAY-Q07 ข้อความโหมดทดลองอยู่ก่อนเนื้อหาทั้ง 4 หน้า", async () => {
    const pages: string[] = [];
    const open = addGroup("14:00");
    signInAs(open.buyerId);
    setNow("14:05");
    pages.push(await payPage(open.groupId));
    await payQr(open.groupId, "14:05");
    pages.push(await payPage(open.groupId));
    sim.mark(pendingChargeId(open.groupId), "successful");
    await pollPaymentAction(open.groupId);
    pages.push(await payPage(open.groupId));
    const failed = addGroup("14:00");
    signInAs(failed.buyerId);
    await payCard(failed.groupId, LOW_FUNDS, "14:06");
    pages.push(await payPage(failed.groupId));

    expect(pages.map((html) => html.match(/<h1>([^<]*)<\/h1>/)?.[1])).toEqual(["จ่ายเงิน", "รอผลการจ่ายเงิน", "จ่ายเงินสำเร็จ", "จ่ายเงินไม่สำเร็จ"]);
    for (const html of pages) {
      expect(html.indexOf("โหมดทดลอง ไม่มีการตัดเงินจริง")).toBeGreaterThan(-1);
      expect(html.indexOf("โหมดทดลอง ไม่มีการตัดเงินจริง")).toBeLessThan(html.indexOf("<h1"));
    }
  });

  test("PAY-Q07 สไตล์ของหน้าจ่ายเงินไม่มีความกว้างตายตัวที่เกินจอ 360 จุด", () => {
    const css = readFileSync(join(process.cwd(), "src/features/payment/components/payment.module.css"), "utf8")
      // เงื่อนไขของ @media คือจุดเปลี่ยนจอ ไม่ใช่ความกว้างของสิ่งที่อยู่บนหน้า
      .replace(/@media[^{]*/g, "");
    const fixed = [...css.matchAll(/(?<!max-)width:\s*(\d+)px/g)].map((match) => Number(match[1]));
    expect(fixed.filter((px) => px > 328)).toEqual([]);
  });
});

describe("PAY-Q08 การเก็บข้อมูล", () => {
  test("PAY-Q08 สร้างการจ่ายเงิน 10 รายการ ปิดแล้วเปิดระบบใหม่ ได้ 10 รายการสถานะเดิม", async () => {
    const folder = mkdtempSync(join(tmpdir(), "blanksong-pay-"));
    try {
      const path = join(folder, "test.db");
      db = openDb(path);
      const provider = createSimulator();
      for (let i = 0; i < 10; i++) {
        const group = addGroup("14:00");
        const input = { buyerId: group.buyerId, groupId: group.groupId };
        if (i % 3 === 0) await payByCard(db, provider, { ...input, card: GOOD }, at("14:05"));
        else if (i % 3 === 1) await payByCard(db, provider, { ...input, card: LOW_FUNDS }, at("14:05"));
        else await payByPromptPay(db, provider, input, at("14:05"));
      }
      const before = db.prepare("SELECT id, status, amount FROM payments ORDER BY id").all();
      db.close();

      db = openDb(path);
      expect(db.prepare("SELECT id, status, amount FROM payments ORDER BY id").all()).toEqual(before);
      expect(before).toHaveLength(10);
      db.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
