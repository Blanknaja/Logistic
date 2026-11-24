// ตัวจำลองการจ่ายเงินในเครื่อง ใช้เมื่อยังไม่ได้ใส่กุญแจทดลองของ Omise และใช้ใน test
// ทำตัวเหมือน Omise โหมดทดลอง: เลขบัตรทดลองชุดเดียวกัน และ PromptPay ค้างรอผลจนมีคนทำเครื่องหมายผล

import { randomBytes } from "node:crypto";
import { ProviderRejected, ProviderUnavailable, type Charge, type PaymentProvider } from "./provider";

/** ปกติ ไม่ตอบเลย (เกิน 10 วินาที) หรือแจ้งว่าให้บริการไม่ได้ */
export type SimulatorMode = "normal" | "no-answer" | "unavailable";

export type Simulator = PaymentProvider & {
  readonly kind: "simulator";
  mode: SimulatorMode;
  /** แทนการกดทำเครื่องหมายผลในหน้าจัดการของ Omise ระบบไม่ได้รับแจ้ง ต้องถามเอง */
  mark(id: string, status: "successful" | "failed"): void;
  find(id: string): Charge | undefined;
  readonly charges: Charge[];
};

/** เลขบัตรทดลองของ Omise จาก docs.omise.co/api-testing */
export const SIMULATOR_CARDS: Record<string, string | null> = {
  "4242424242424242": null,
  "4111111111111111": null,
  "5555555555554444": null,
  "5454545454545454": null,
  "4111111111140011": "insufficient_fund",
  "5555551111110011": "insufficient_fund",
  "4111111111130012": "stolen_or_lost_card",
  "5555551111100012": "stolen_or_lost_card",
  "4111111111120013": "failed_processing",
  "5555551111190013": "failed_processing",
  "4111111111110014": "payment_rejected",
  "5555551111180014": "payment_rejected",
  "4111111111190016": "failed_fraud_check",
  "5555551111160016": "failed_fraud_check",
  "4111111111180017": "invalid_account_number",
  "5555551111150017": "invalid_account_number",
};

function qrImage(amount: number): string {
  const finder = (x: number, y: number) =>
    `<rect x="${x}" y="${y}" width="50" height="50" fill="#000"/><rect x="${x + 8}" y="${y + 8}" width="34" height="34" fill="#fff"/><rect x="${x + 16}" y="${y + 16}" width="18" height="18" fill="#000"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 230"><rect width="200" height="230" fill="#fff"/>${finder(10, 10)}${finder(140, 10)}${finder(10, 140)}<text x="100" y="105" text-anchor="middle" font-size="16">QR ตัวจำลอง</text><text x="100" y="220" text-anchor="middle" font-size="18">฿${amount}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function createSimulator(): Simulator {
  const charges = new Map<string, Charge>();

  function respond(): Promise<void> {
    if (simulator.mode === "no-answer") return new Promise(() => {});
    if (simulator.mode === "unavailable") return Promise.reject(new ProviderUnavailable("ตัวจำลอง: Omise ให้บริการไม่ได้"));
    return Promise.resolve();
  }

  function create(charge: Omit<Charge, "id" | "failureMessage">): Charge {
    const created = { ...charge, id: `chrg_test_sim${randomBytes(8).toString("hex")}`, failureMessage: null };
    charges.set(created.id, created);
    return { ...created };
  }

  const simulator: Simulator = {
    kind: "simulator",
    mode: "normal",

    async chargeCard({ amount, card }) {
      await respond();
      const number = card.number.replace(/\D/g, "");
      if (!(number in SIMULATOR_CARDS)) throw new ProviderRejected("invalid_card", "not an Omise test card");
      const failureCode = SIMULATOR_CARDS[number];
      return create({
        amount,
        status: failureCode ? "failed" : "successful",
        failureCode,
        cardLast4: number.slice(-4),
        qrImageUrl: null,
      });
    },

    async chargePromptPay({ amount }) {
      await respond();
      return create({ amount, status: "pending", failureCode: null, cardLast4: null, qrImageUrl: qrImage(amount) });
    },

    async retrieveCharge(id) {
      await respond();
      const charge = charges.get(id);
      if (!charge) throw new ProviderRejected("not_found", `charge ${id} was not found`);
      return { ...charge };
    },

    mark(id, status) {
      const charge = charges.get(id);
      if (!charge || charge.status !== "pending") return;
      charge.status = status;
      if (status === "failed") charge.failureCode = "failed_processing";
    },

    find(id) {
      const charge = charges.get(id);
      return charge && { ...charge };
    },

    get charges() {
      return [...charges.values()];
    },
  };
  return simulator;
}
