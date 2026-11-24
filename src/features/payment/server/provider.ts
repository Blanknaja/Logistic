// ผู้ให้บริการจ่ายเงินมีสองตัวที่ใช้แทนกันได้: Omise โหมดทดลอง (omise.ts) กับตัวจำลองในเครื่อง (simulator.ts)
// เงินในไฟล์นี้เป็นจำนวนเต็มบาทเหมือนทั้งแอป ตัวที่ต่อ Omise แปลงเป็นหน่วยย่อยเอง

/** สถานะของ charge ตามที่ Omise ใช้ */
export type ChargeStatus = "pending" | "successful" | "failed" | "expired" | "reversed";

export type Charge = {
  id: string;
  amount: number;
  status: ChargeStatus;
  failureCode: string | null;
  failureMessage: string | null;
  cardLast4: string | null;
  qrImageUrl: string | null;
};

/** ข้อมูลบัตรส่งต่อให้ผู้ให้บริการเท่านั้น ห้ามเก็บหรือเขียน log */
export type CardInput = {
  number: string;
  name: string;
  expirationMonth: number;
  expirationYear: number;
  securityCode: string;
};

export type PaymentProvider = {
  readonly kind: "omise" | "simulator";
  chargeCard(input: { amount: number; card: CardInput; description: string }): Promise<Charge>;
  chargePromptPay(input: { amount: number; description: string }): Promise<Charge>;
  retrieveCharge(id: string): Promise<Charge>;
};

/** ผู้ให้บริการล่ม ตอบช้า หรือต่อไม่ได้ ไม่รู้ว่าเงินถูกตัดหรือยัง */
export class ProviderUnavailable extends Error {}

/** ผู้ให้บริการตอบกลับมาชัดว่าไม่รับรายการนี้ เช่น เลขบัตรผิด */
export class ProviderRejected extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
