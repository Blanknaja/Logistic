import type { Checked } from "@/shared/result";
import type { CardInput } from "./provider";

export type CardFields = { number: string; name: string; expiry: string; securityCode: string };
export type CardErrors = Partial<Record<keyof CardFields, string>>;

function passesLuhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let digit = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) digit = digit * 2 > 9 ? digit * 2 - 9 : digit * 2;
    sum += digit;
  }
  return sum % 10 === 0;
}

/** ตรวจแบบกรอกบัตรก่อนส่งให้ผู้ให้บริการ (PAY-003) */
export function validateCard(fields: CardFields, now: Date): Checked<{ card: CardInput }, CardErrors> {
  const errors: CardErrors = {};
  const number = fields.number.replace(/[\s-]/g, "");
  if (!number) errors.number = "กรุณากรอกเลขบัตร";
  else if (!/^\d+$/.test(number)) errors.number = "เลขบัตรต้องเป็นตัวเลข";
  else if (number.length < 13) errors.number = "เลขบัตรไม่ครบ";
  else if (number.length > 19 || !passesLuhn(number)) errors.number = "เลขบัตรไม่ถูกต้อง";

  const name = fields.name.trim();
  if (!name) errors.name = "กรุณากรอกชื่อบนบัตร";

  const expiry = fields.expiry.trim().match(/^(\d{1,2})\s*\/\s*(\d{2}|\d{4})$/);
  const month = Number(expiry?.[1]);
  const year = expiry?.[2].length === 2 ? 2000 + Number(expiry[2]) : Number(expiry?.[2]);
  if (!fields.expiry.trim()) errors.expiry = "กรุณากรอกเดือนปีหมดอายุ";
  else if (!expiry || month < 1 || month > 12) errors.expiry = "เดือนปีหมดอายุไม่ถูกต้อง ตัวอย่าง 12/28";
  else if (year * 12 + month < now.getUTCFullYear() * 12 + now.getUTCMonth() + 1) errors.expiry = "บัตรหมดอายุแล้ว";

  const securityCode = fields.securityCode.trim();
  if (!securityCode) errors.securityCode = "กรุณากรอกรหัสหลังบัตร";
  else if (!/^\d{3,4}$/.test(securityCode)) errors.securityCode = "รหัสหลังบัตรไม่ถูกต้อง";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, card: { number, name, expirationMonth: month, expirationYear: year, securityCode } };
}
