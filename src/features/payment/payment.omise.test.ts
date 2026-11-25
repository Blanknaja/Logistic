// PAY กับ Omise โหมดทดลองจริง รันด้วย pnpm test:omise เท่านั้น ไม่อยู่ใน pnpm check
// ต้องมี OMISE_PUBLIC_KEY และ OMISE_SECRET_KEY แบบโหมดทดลองใน .env.local ไม่มีแล้วข้ามทั้งไฟล์
// ทุก test สร้าง charge จริงในบัญชีทดลองของ Omise ไม่มีเงินจริง

import { beforeEach, describe, expect, test, vi } from "vitest";
import { POST as webhook } from "@/app/pay/omise-webhook/route";
import type { CardFields } from "@/features/payment/server/card";
import { getPaymentProvider } from "@/features/payment/server/config";
import {
  changePaymentMethod,
  checkPaymentStatus,
  payByCard,
  payByPromptPay,
  syncGroupPayments,
} from "@/features/payment/server/payments";
import type { Db } from "@/shared/db";
import { addAccount, addOrder, addProduct, addShop } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";

const request = vi.hoisted(() => ({ db: undefined as Db | undefined }));

vi.mock("@/shared/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/db")>()),
  getDb: () => request.db,
}));

const secretKey = process.env.OMISE_SECRET_KEY ?? "";
const ready = Boolean(process.env.OMISE_PUBLIC_KEY?.includes("_test_") && secretKey.includes("_test_"));

if (!ready) {
  test.skip("ข้ามทั้งไฟล์: ไม่มี OMISE_PUBLIC_KEY และ OMISE_SECRET_KEY แบบโหมดทดลอง ใส่ใน .env.local แล้วรัน pnpm test:omise ใหม่", () => {});
}

// เลขบัตรทดลองจาก docs.omise.co/api-testing
const GOOD: CardFields = { number: "4242 4242 4242 4242", name: "SOMCHAI JAIDEE", expiry: "12/30", securityCode: "123" };
const LOW_FUNDS: CardFields = { ...GOOD, number: "4111 1111 1114 0011" };
const REJECTED: CardFields = { ...GOOD, number: "4111 1111 1111 0014" };
const THREE_DS: CardFields = { ...GOOD, number: "4111 1111 1115 0002" };

let db: Db;
const omise = () => getPaymentProvider();

beforeEach(() => {
  db = createTestDb();
  request.db = db;
});

/** สองคำสั่งซื้อ `รอจ่ายเงิน` ในกลุ่มเดียวที่สั่งเมื่อกี้ ยอดรวม 450 บาท (290 + 160) */
function addGroup() {
  const buyer = addAccount(db);
  const products = [250, 120].map((price) => addProduct(db, { shopId: addShop(db).id, price, stock: 5 }));
  const first = addOrder(db, { buyerAccountId: buyer.id, items: [{ variantId: products[0].variantIds[0] }] });
  addOrder(db, { buyerAccountId: buyer.id, items: [{ variantId: products[1].variantIds[0] }], groupId: first.groupId });
  return { buyerId: buyer.id, groupId: first.groupId };
}

const payments = (groupId: number) =>
  db
    .prepare("SELECT status, amount, omise_charge_id, card_last4, failure_reason, qr_image_url FROM payments WHERE group_id = ? ORDER BY id")
    .all(groupId) as {
    status: string;
    amount: number;
    omise_charge_id: string | null;
    card_last4: string | null;
    failure_reason: string | null;
    qr_image_url: string | null;
  }[];

const orderStatuses = (groupId: number) =>
  (db.prepare("SELECT status FROM orders WHERE group_id = ? ORDER BY id").all(groupId) as { status: string }[]).map((o) => o.status);

/** เรียก API ของ Omise ที่แอปไม่ได้ใช้ เช่นทำเครื่องหมายผลของ charge ทดลอง และอ่านเหตุการณ์ */
async function omiseApi<T>(path: string, method = "GET"): Promise<T> {
  const response = await fetch(`https://api.omise.co${path}`, {
    method,
    headers: { Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}` },
  });
  expect(response.status, `${method} ${path}`).toBe(200);
  return (await response.json()) as T;
}

type OmiseEvent = { object: string; key: string; data: { id: string; status: string; amount: number } };

/** Omise สร้างเหตุการณ์ช้ากว่า charge เล็กน้อย จึงรอจนเจอ */
async function eventFor(key: string, chargeId: string): Promise<OmiseEvent> {
  for (let attempt = 0; attempt < 15; attempt++) {
    const { data } = await omiseApi<{ data: OmiseEvent[] }>("/events?limit=50&order=reverse_chronological");
    const event = data.find((e) => e.key === key && e.data.id === chargeId);
    if (event) return event;
    await new Promise((done) => setTimeout(done, 1000));
  }
  throw new Error(`ไม่พบเหตุการณ์ ${key} ของ ${chargeId}`);
}

const postWebhook = async (event: unknown) =>
  (await (await webhook(new Request("http://localhost/pay/omise-webhook", { method: "POST", body: JSON.stringify(event) }))).json()) as {
    result: string;
  };

describe.runIf(ready)("PAY กับ Omise โหมดทดลองจริง", () => {
  test("ใส่กุญแจทดลองแล้ว แอปใช้ Omise ไม่ใช่ตัวจำลอง", () => {
    expect(omise().kind).toBe("omise");
  });

  test("PAY-003 PAY-005 บัตรทดลองแบบจ่ายสำเร็จ Omise ตัดบัตร 450 บาทครั้งเดียว คำสั่งซื้อทั้งสองเป็นจ่ายแล้ว", async () => {
    const group = addGroup();
    expect(await payByCard(db, omise(), { ...group, card: GOOD })).toEqual({ kind: "done", status: "สำเร็จ" });

    const [payment] = payments(group.groupId);
    expect(payment).toMatchObject({ status: "สำเร็จ", amount: 450, card_last4: "4242", omise_charge_id: expect.stringMatching(/^chrg_test_/) });
    expect(await omise().retrieveCharge(payment.omise_charge_id!)).toMatchObject({ status: "successful", amount: 450 });
    expect(orderStatuses(group.groupId)).toEqual(["จ่ายแล้ว", "จ่ายแล้ว"]);
  });

  test("PAY-006 บัตรทดลองแบบเงินไม่พอและแบบถูกปฏิเสธได้เหตุผลภาษาไทย คำสั่งซื้อยังรอจ่ายเงิน แล้วจ่ายใหม่สำเร็จ", async () => {
    const group = addGroup();
    for (const card of [LOW_FUNDS, REJECTED]) {
      expect(await payByCard(db, omise(), { ...group, card })).toEqual({ kind: "done", status: "ไม่สำเร็จ" });
    }
    expect(orderStatuses(group.groupId)).toEqual(["รอจ่ายเงิน", "รอจ่ายเงิน"]);
    await payByCard(db, omise(), { ...group, card: GOOD });

    expect(payments(group.groupId).map((p) => [p.status, p.failure_reason])).toEqual([
      ["ไม่สำเร็จ", "บัตรถูกปฏิเสธ: วงเงินไม่พอ"],
      ["ไม่สำเร็จ", "บัตรถูกปฏิเสธ: ธนาคารไม่อนุมัติ"],
      ["สำเร็จ", null],
    ]);
    expect(orderStatuses(group.groupId)).toEqual(["จ่ายแล้ว", "จ่ายแล้ว"]);
  });

  test("PAY-003 บัญชีทดลองนี้ไม่ได้เปิด 3-D Secure บัตรทดลองของ 3-D Secure จึงจ่ายสำเร็จทันทีโดยไม่ต้องยืนยันตัวตน", async () => {
    // ถ้า test นี้พัง แปลว่าเปิด 3-D Secure แล้ว ระบบต้องส่ง return_uri และพาผู้ซื้อไป authorize_uri ซึ่งยังไม่ได้ทำ
    const group = addGroup();
    expect(await payByCard(db, omise(), { ...group, card: THREE_DS })).toEqual({ kind: "done", status: "สำเร็จ" });
  });

  test("PAY-004 PAY-008 PromptPay เปิดรูป QR ได้โดยไม่ใช้กุญแจ ยังไม่ได้รับเงินจนทำเครื่องหมายว่าสำเร็จ แล้วเช็คสถานะได้จ่ายแล้ว", async () => {
    const group = addGroup();
    expect(await payByPromptPay(db, omise(), group)).toEqual({ kind: "done", status: "รอผล" });
    const [payment] = payments(group.groupId);

    const qr = await fetch(payment.qr_image_url!);
    expect([qr.status, qr.headers.get("content-type")]).toEqual([200, "image/svg+xml"]);
    expect(await checkPaymentStatus(db, omise(), group)).toMatchObject({ kind: "still-pending" });

    await omiseApi(`/charges/${payment.omise_charge_id}/mark_as_paid`, "POST");
    expect(await checkPaymentStatus(db, omise(), group)).toEqual({ kind: "resolved" });
    expect(payments(group.groupId).map((p) => p.status)).toEqual(["สำเร็จ"]);
    expect(orderStatuses(group.groupId)).toEqual(["จ่ายแล้ว", "จ่ายแล้ว"]);
  });

  test("PAY-004 PromptPay ที่ทำเครื่องหมายว่าไม่สำเร็จ หน้าที่เปิดค้างถามผลแล้วได้ไม่สำเร็จพร้อมเหตุผล คำสั่งซื้อยังรอจ่ายเงิน", async () => {
    const group = addGroup();
    await payByPromptPay(db, omise(), group);
    await omiseApi(`/charges/${payments(group.groupId)[0].omise_charge_id}/mark_as_failed`, "POST");
    await syncGroupPayments(db, omise(), group);

    expect(payments(group.groupId).map((p) => [p.status, p.failure_reason])).toEqual([["ไม่สำเร็จ", "จ่ายเงินไม่สำเร็จ: ระบบรับเงินขัดข้อง"]]);
    expect(orderStatuses(group.groupId)).toEqual(["รอจ่ายเงิน", "รอจ่ายเงิน"]);
  });

  test("PAY-012 PAY-010 เลิกใช้ QR แล้วจ่ายด้วยบัตร จากนั้น QR เดิมถูกทำเครื่องหมายว่าสำเร็จ เงินนั้นเป็นสำเร็จแต่ไม่ถูกใช้", async () => {
    const group = addGroup();
    await payByPromptPay(db, omise(), group);
    const qrCharge = payments(group.groupId)[0].omise_charge_id;
    changePaymentMethod(db, group);
    await payByCard(db, omise(), { ...group, card: GOOD });
    await omiseApi(`/charges/${qrCharge}/mark_as_paid`, "POST");
    await syncGroupPayments(db, omise(), group);

    expect(payments(group.groupId).map((p) => p.status)).toEqual(["สำเร็จแต่ไม่ถูกใช้", "สำเร็จ"]);
    expect(orderStatuses(group.groupId)).toEqual(["จ่ายแล้ว", "จ่ายแล้ว"]);
  });

  test("PAY-015 webhook เหตุการณ์ปลอมที่บอกว่าสำเร็จไม่เปลี่ยนอะไร เหตุการณ์จริงหลังทำเครื่องหมายว่าสำเร็จถูกใช้ครั้งเดียว", async () => {
    const group = addGroup();
    await payByPromptPay(db, omise(), group);
    const chargeId = payments(group.groupId)[0].omise_charge_id!;

    const created = await eventFor("charge.create", chargeId);
    await postWebhook({ ...created, key: "charge.complete", data: { ...created.data, status: "successful" } });
    expect(payments(group.groupId).map((p) => p.status)).toEqual(["รอผล"]);

    await omiseApi(`/charges/${chargeId}/mark_as_paid`, "POST");
    const complete = await eventFor("charge.complete", chargeId);
    expect(await postWebhook(complete)).toEqual({ result: "applied" });
    expect(await postWebhook(complete)).toEqual({ result: "already-used" });
    expect(payments(group.groupId).map((p) => p.status)).toEqual(["สำเร็จ"]);
    expect(orderStatuses(group.groupId)).toEqual(["จ่ายแล้ว", "จ่ายแล้ว"]);
  });

  test("PAY-007 รอ Omise ไม่ทัน การจ่ายเงินเป็นเลิกรอ และเมื่อ Omise ตัดบัตรสำเร็จทีหลัง ระบบยังจับคู่เงินนั้นได้", async () => {
    const group = addGroup();
    // รอแค่ 100 มิลลิวินาที น้อยกว่าเวลาที่ Omise ใช้จริงเสมอ แทน Omise ที่ตอบช้าเกิน 10 วินาที
    expect(await payByCard(db, omise(), { ...group, card: GOOD }, new Date(), 100)).toMatchObject({ kind: "unavailable" });
    expect(payments(group.groupId).map((p) => p.status)).toEqual(["เลิกรอ"]);

    await vi.waitFor(() => expect(payments(group.groupId).map((p) => p.status)).toEqual(["สำเร็จ"]), { timeout: 20_000, interval: 200 });
    expect(orderStatuses(group.groupId)).toEqual(["จ่ายแล้ว", "จ่ายแล้ว"]);
  });

  test("PAY-009 กดจ่ายเงินสองครั้งพร้อมกัน เกิดการจ่ายเงินรายการเดียว", async () => {
    const group = addGroup();
    const results = await Promise.all([payByCard(db, omise(), { ...group, card: GOOD }), payByCard(db, omise(), { ...group, card: GOOD })]);

    expect(results.map((r) => r.kind).sort()).toEqual(["done", "pending-exists"]);
    expect(payments(group.groupId).map((p) => p.status)).toEqual(["สำเร็จ"]);
  });
});
