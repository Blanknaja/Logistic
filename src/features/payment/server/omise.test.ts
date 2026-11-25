// ตัวต่อ Omise ทดสอบกับ fetch ปลอม ไม่ต่ออินเทอร์เน็ต
// คำตอบปลอมมาจาก omise-recorded.json ซึ่งบันทึกจาก Omise โหมดทดลองจริงเมื่อ 2026-11-25 (ตัดข้อมูลส่วนตัวออกแล้ว)
// ลองกับ Omise จริงอีกครั้งได้ด้วย pnpm test:omise

import { describe, expect, test } from "vitest";
import { getPaymentProvider } from "./config";
import { createOmiseProvider } from "./omise";
import recorded from "./omise-recorded.json";
import { ProviderRejected, ProviderUnavailable } from "./provider";

const keys = { publicKey: "pkey_test_abc", secretKey: "skey_test_xyz" };
const basic = (key: string) => `Basic ${Buffer.from(`${key}:`).toString("base64")}`;

type Sent = { url: string; method: string; auth: string; body: Record<string, string> };

function fakeFetch(...answers: (Response | Error)[]) {
  const sent: Sent[] = [];
  const send = (async (url: string, init: RequestInit) => {
    sent.push({
      url,
      method: init.method ?? "GET",
      auth: new Headers(init.headers).get("Authorization") ?? "",
      body: Object.fromEntries(new URLSearchParams((init.body as URLSearchParams | undefined)?.toString() ?? "")),
    });
    const answer = answers.shift();
    if (!answer || answer instanceof Error) throw answer ?? new Error("ไม่มีคำตอบ");
    return answer;
  }) as typeof fetch;
  return { send, sent };
}

const json = (body: unknown, status = 200) => Response.json(body, { status });
const replay = ({ status, body }: { status: number; body: unknown }) => json(body, status);
const card = { number: "4242424242424242", name: "SOMCHAI JAIDEE", expirationMonth: 12, expirationYear: 2028, securityCode: "123" };

describe("PAY-003 ตัดบัตรผ่าน Omise", () => {
  test("PAY-003 ขอ token ที่ vault ด้วยกุญแจสาธารณะ แล้วตัดบัตรที่ api ด้วยกุญแจลับ ยอดเป็นหน่วยย่อย", async () => {
    const { send, sent } = fakeFetch(json(recorded.token), json(recorded.cardSuccessful));
    const charge = await createOmiseProvider({ ...keys, fetch: send }).chargeCard({ amount: 450, card, description: "กลุ่ม 1" });

    expect(sent[0]).toEqual({
      url: "https://vault.omise.co/tokens",
      method: "POST",
      auth: basic(keys.publicKey),
      body: {
        "card[name]": "SOMCHAI JAIDEE",
        "card[number]": "4242424242424242",
        "card[expiration_month]": "12",
        "card[expiration_year]": "2028",
        "card[security_code]": "123",
      },
    });
    expect(sent[1]).toEqual({
      url: "https://api.omise.co/charges",
      method: "POST",
      auth: basic(keys.secretKey),
      body: { amount: "45000", currency: "thb", card: recorded.token.id, description: "กลุ่ม 1" },
    });
    expect(charge).toEqual({
      id: recorded.cardSuccessful.id,
      amount: 450,
      status: "successful",
      failureCode: null,
      failureMessage: null,
      cardLast4: "4242",
      qrImageUrl: null,
    });
  });

  test("PAY-003 บัตรถูกปฏิเสธได้ charge สถานะ failed พร้อมรหัสเหตุผล ส่วนข้อมูลบัตรผิดได้ ProviderRejected", async () => {
    const declined = fakeFetch(json(recorded.token), json(recorded.cardInsufficientFund));
    expect(await createOmiseProvider({ ...keys, fetch: declined.send }).chargeCard({ amount: 450, card, description: "" })).toMatchObject(
      { status: "failed", failureCode: "insufficient_fund", failureMessage: recorded.cardInsufficientFund.failure_message },
    );

    const invalid = fakeFetch(json({ object: "error", code: "invalid_card", message: "number is invalid" }, 400));
    const error = await createOmiseProvider({ ...keys, fetch: invalid.send })
      .chargeCard({ amount: 450, card, description: "" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderRejected);
    expect((error as ProviderRejected).code).toBe("invalid_card");
  });

  test("PAY-006 ยอดต่ำกว่าที่ Omise รับได้ ProviderRejected พร้อมข้อความของ Omise", async () => {
    const { send } = fakeFetch(replay(recorded.amountTooSmall));
    const error = await createOmiseProvider({ ...keys, fetch: send })
      .chargePromptPay({ amount: 19, description: "" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderRejected);
    expect(error).toMatchObject({ code: "invalid_charge", message: recorded.amountTooSmall.body.message });
  });
});

describe("PAY-004 สร้าง QR ของ PromptPay ผ่าน Omise", () => {
  test("PAY-004 ส่ง source[type]=promptpay และได้รูป QR จาก source.scannable_code.image.download_uri", async () => {
    const { send, sent } = fakeFetch(json(recorded.promptPayPending));
    const charge = await createOmiseProvider({ ...keys, fetch: send }).chargePromptPay({ amount: 450, description: "กลุ่ม 1" });

    expect(sent[0].body).toEqual({ amount: "45000", currency: "thb", "source[type]": "promptpay", description: "กลุ่ม 1" });
    expect(charge).toMatchObject({
      status: "pending",
      qrImageUrl: recorded.promptPayPending.source.scannable_code.image.download_uri,
      amount: 450,
      cardLast4: null,
    });
  });

  test("PAY-004 ไม่มีรูป QR ในคำตอบ ได้ค่าว่างให้หน้าแสดงว่าแสดง QR ไม่ได้", async () => {
    const { send } = fakeFetch(json({ ...recorded.promptPayPending, source: { ...recorded.promptPayPending.source, scannable_code: null } }));
    expect((await createOmiseProvider({ ...keys, fetch: send }).chargePromptPay({ amount: 450, description: "" })).qrImageUrl).toBeNull();
  });

  test("PAY-004 ทำเครื่องหมายว่าไม่สำเร็จได้ failed_processing และ QR ที่หมดอายุได้ expired โดยไม่มีรหัสเหตุผล", async () => {
    const { send } = fakeFetch(json(recorded.promptPayMarkedFailed), json(recorded.promptPayExpired));
    const omise = createOmiseProvider({ ...keys, fetch: send });
    expect(await omise.retrieveCharge(recorded.promptPayMarkedFailed.id)).toMatchObject({ status: "failed", failureCode: "failed_processing" });
    expect(await omise.retrieveCharge(recorded.promptPayExpired.id)).toMatchObject({ status: "expired", failureCode: null });
  });
});

describe("PAY-007 PAY-008 Omise ล่มหรือตอบช้า", () => {
  test("PAY-008 ถามผลด้วย GET /charges/{id}", async () => {
    const { send, sent } = fakeFetch(json(recorded.promptPayMarkedPaid));
    const id = recorded.promptPayMarkedPaid.id;
    expect((await createOmiseProvider({ ...keys, fetch: send }).retrieveCharge(id)).status).toBe("successful");
    expect(sent[0]).toMatchObject({ url: `https://api.omise.co/charges/${id}`, method: "GET", auth: basic(keys.secretKey) });
  });

  test("PAY-008 charge ที่ Omise ไม่รู้จักได้ ProviderRejected", async () => {
    const { send } = fakeFetch(replay(recorded.chargeNotFound));
    await expect(createOmiseProvider({ ...keys, fetch: send }).retrieveCharge("chrg_test_doesnotexist")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  test("PAY-007 ต่อไม่ได้ ตอบ 5xx หรือ 429 ได้ ProviderUnavailable ไม่ใช่จ่ายไม่สำเร็จ", async () => {
    for (const answer of [new TypeError("fetch failed"), json({ object: "error", code: "internal" }, 503), json({}, 429)]) {
      const { send } = fakeFetch(answer);
      await expect(createOmiseProvider({ ...keys, fetch: send }).retrieveCharge("chrg_test_6")).rejects.toBeInstanceOf(ProviderUnavailable);
    }
  });

  test("PAY-007 Omise ไม่รับกุญแจ (401) ได้ ProviderUnavailable เพราะยังไม่มีการจ่ายเงินเกิดขึ้น ไม่ใช่บัตรของผู้ซื้อถูกปฏิเสธ", async () => {
    const { send } = fakeFetch(replay(recorded.wrongKey));
    await expect(createOmiseProvider({ ...keys, fetch: send }).chargePromptPay({ amount: 450, description: "" })).rejects.toBeInstanceOf(
      ProviderUnavailable,
    );
  });
});

describe("กุญแจของ Omise อ่านจากค่าตั้งเท่านั้น", () => {
  test("ไม่ใส่กุญแจได้ตัวจำลอง ใส่กุญแจทดลองครบได้ Omise", () => {
    expect(getPaymentProvider({}).kind).toBe("simulator");
    expect(getPaymentProvider({ OMISE_PUBLIC_KEY: "", OMISE_SECRET_KEY: "" }).kind).toBe("simulator");
    expect(getPaymentProvider({ OMISE_PUBLIC_KEY: "pkey_test_a", OMISE_SECRET_KEY: "skey_test_b" }).kind).toBe("omise");
  });

  test("ใส่กุญแจไม่ครบ หรือใส่กุญแจที่ไม่ใช่โหมดทดลอง ไม่ยอมใช้", () => {
    expect(() => getPaymentProvider({ OMISE_SECRET_KEY: "skey_test_b" })).toThrow("ต้องใส่ทั้ง");
    expect(() => getPaymentProvider({ OMISE_PUBLIC_KEY: "pkey_live_a", OMISE_SECRET_KEY: "skey_live_b" })).toThrow("โหมดทดลอง");
  });
});
