// ต่อ Omise โหมดทดลองตามคู่มือที่ docs.omise.co (Charges API, Tokens API, PromptPay) อ่านเมื่อ 2026-11-25
// ยังไม่เคยลองกับบัญชีจริง เรื่องที่ต้องลองอยู่ในคำถามค้างของ docs/requirements/payment.md

import { ProviderRejected, ProviderUnavailable, type Charge, type PaymentProvider } from "./provider";

export type OmiseProvider = PaymentProvider & { readonly kind: "omise" };

const API = "https://api.omise.co";
const VAULT = "https://vault.omise.co";

type OmiseCharge = {
  id: string;
  amount: number;
  status: Charge["status"];
  failure_code?: string | null;
  failure_message?: string | null;
  card?: { last_digits?: string } | null;
  source?: { scannable_code?: { image?: { download_uri?: string } } } | null;
};

export function createOmiseProvider({
  publicKey,
  secretKey,
  fetch: send = fetch,
  timeoutMs = 10_000,
}: {
  publicKey: string;
  secretKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): OmiseProvider {
  // กุญแจเป็นชื่อผู้ใช้ของ HTTP Basic รหัสผ่านว่าง
  async function call<T>(base: string, key: string, path: string, form?: Record<string, string>): Promise<T> {
    let response: Response;
    try {
      response = await send(`${base}${path}`, {
        method: form ? "POST" : "GET",
        headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}` },
        body: form ? new URLSearchParams(form) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new ProviderUnavailable(`ต่อ Omise ไม่ได้ (${path})`);
    }
    const body = (await response.json().catch(() => null)) as (T & { object?: string; code?: string; message?: string }) | null;
    if (response.status >= 500 || response.status === 429 || !body) {
      throw new ProviderUnavailable(`Omise ตอบ ${response.status} (${path})`);
    }
    if (!response.ok || body.object === "error") throw new ProviderRejected(body.code ?? "error", body.message ?? "");
    return body;
  }

  const toCharge = (charge: OmiseCharge): Charge => ({
    id: charge.id,
    amount: charge.amount / 100,
    status: charge.status,
    failureCode: charge.failure_code ?? null,
    failureMessage: charge.failure_message ?? null,
    cardLast4: charge.card?.last_digits ?? null,
    qrImageUrl: charge.source?.scannable_code?.image?.download_uri ?? null,
  });

  const createCharge = async (form: Record<string, string>) => toCharge(await call<OmiseCharge>(API, secretKey, "/charges", form));

  return {
    kind: "omise",

    async chargeCard({ amount, card, description }) {
      const token = await call<{ id: string }>(VAULT, publicKey, "/tokens", {
        "card[name]": card.name,
        "card[number]": card.number,
        "card[expiration_month]": String(card.expirationMonth),
        "card[expiration_year]": String(card.expirationYear),
        "card[security_code]": card.securityCode,
      });
      return createCharge({ amount: String(amount * 100), currency: "thb", card: token.id, description });
    },

    async chargePromptPay({ amount, description }) {
      return createCharge({ amount: String(amount * 100), currency: "thb", "source[type]": "promptpay", description });
    },

    async retrieveCharge(id) {
      return toCharge(await call<OmiseCharge>(API, secretKey, `/charges/${encodeURIComponent(id)}`));
    },
  };
}
