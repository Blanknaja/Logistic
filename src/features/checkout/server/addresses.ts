import { transaction, type Db } from "@/shared/db";
import { PROVINCES } from "@/shared/provinces";
import type { Checked } from "@/shared/result";
import { isPhone } from "@/shared/rules";

export const MAX_ADDRESSES = 10;
export const ADDRESS_LIMIT = "มีที่อยู่ได้ไม่เกิน 10 แห่ง กรุณาลบที่อยู่ที่ไม่ใช้ก่อน";
export const ADDRESS_GONE = "ไม่พบที่อยู่นี้แล้ว";

export type AddressInput = {
  recipientName: string;
  phone: string;
  address: string;
  subdistrict: string;
  district: string;
  province: string;
  postcode: string;
};

/** form คือข้อความของทั้งแบบฟอร์ม เช่น ที่อยู่เต็มแล้ว */
export type AddressErrors = Partial<Record<keyof AddressInput | "form", string>>;

export type ShippingAddress = AddressInput & { id: number; isDefault: boolean };

export type SaveResult = Checked<{ id: number }, AddressErrors>;

type Row = {
  id: number;
  recipient_name: string;
  phone: string;
  address: string;
  subdistrict: string;
  district: string;
  province: string;
  postcode: string;
  is_default: number;
};

const COLUMNS = "id, recipient_name, phone, address, subdistrict, district, province, postcode, is_default";
// ที่อยู่หลักก่อน แล้วที่เพิ่มล่าสุด (CHK-001) ลำดับนี้ใช้เลือกที่อยู่หลักแทนตอนลบด้วย (CHK-003)
const ORDER = "is_default DESC, created_at DESC, id DESC";

function toAddress(row: Row): ShippingAddress {
  return {
    id: row.id,
    recipientName: row.recipient_name,
    phone: row.phone,
    address: row.address,
    subdistrict: row.subdistrict,
    district: row.district,
    province: row.province,
    postcode: row.postcode,
    isDefault: row.is_default === 1,
  };
}

/** CHK-001 ที่อยู่ทั้งหมดของบัญชีนี้ ที่อยู่หลักอยู่แรกสุด ตามด้วยที่เพิ่มล่าสุด */
export function listAddresses(db: Db, accountId: number): ShippingAddress[] {
  return (db.prepare(`SELECT ${COLUMNS} FROM shipping_addresses WHERE account_id = ? ORDER BY ${ORDER}`).all(accountId) as Row[]).map(
    toAddress,
  );
}

/** ที่อยู่หนึ่งแห่งของบัญชีนี้ null ถ้าไม่มีหรือเป็นของบัญชีอื่น */
export function getAddress(db: Db, accountId: number, addressId: number): ShippingAddress | null {
  const row = db.prepare(`SELECT ${COLUMNS} FROM shipping_addresses WHERE id = ? AND account_id = ?`).get(addressId, accountId) as
    | Row
    | undefined;
  return row ? toAddress(row) : null;
}

/** ที่อยู่ในบรรทัดเดียว ไม่รวมชื่อผู้รับและเบอร์โทร */
export function fullAddress(a: AddressInput): string {
  return [a.address, a.subdistrict, a.district, a.province, a.postcode].join(" ");
}

/** นับเป็นตัวอักษร ไม่ใช่หน่วยของ JavaScript */
const length = (text: string) => [...text].length;

function textError(value: string, label: string, max: number): string | undefined {
  if (value === "") return `กรุณากรอก${label}`;
  if (length(value) > max) return `${label}ต้องยาวไม่เกิน ${max} ตัวอักษร`;
}

function clean(input: AddressInput): AddressInput {
  return {
    recipientName: input.recipientName.trim(),
    phone: input.phone.trim(),
    address: input.address.trim(),
    subdistrict: input.subdistrict.trim(),
    district: input.district.trim(),
    province: input.province.trim(),
    postcode: input.postcode.trim(),
  };
}

/** CHK-002 ตรวจทุกช่องตามตาราง คืน null ถ้าถูกทุกช่อง */
function validate(a: AddressInput): AddressErrors | null {
  const errors: AddressErrors = {
    recipientName: textError(a.recipientName, "ชื่อผู้รับ", 100),
    phone: isPhone(a.phone) ? undefined : "เบอร์โทรต้องเป็นตัวเลข 10 หลัก ขึ้นต้นด้วย 0",
    address: textError(a.address, "ที่อยู่", 200),
    subdistrict: textError(a.subdistrict, "ตำบลหรือแขวง", 100),
    district: textError(a.district, "อำเภอหรือเขต", 100),
    province: (PROVINCES as readonly string[]).includes(a.province) ? undefined : "กรุณาเลือกจังหวัด",
    postcode: /^\d{5}$/.test(a.postcode) ? undefined : "กรุณากรอกรหัสไปรษณีย์ 5 หลัก",
  };
  const entries = Object.entries(errors).filter(([, message]) => message !== undefined);
  return entries.length === 0 ? null : Object.fromEntries(entries);
}

/** CHK-002 เพิ่มที่อยู่ แห่งแรกของบัญชีเป็นที่อยู่หลักเอง */
export function createAddress(db: Db, accountId: number, input: AddressInput, now: Date = new Date()): SaveResult {
  const a = clean(input);
  const errors = validate(a);
  if (errors) return { ok: false, errors };

  return transaction(db, () => {
    // กดบันทึกซ้ำส่งข้อมูลเดิมมาอีกครั้ง ได้ที่อยู่แห่งเดิมแทนการเพิ่มแห่งใหม่
    const same = db
      .prepare(
        `SELECT id FROM shipping_addresses
         WHERE account_id = ? AND recipient_name = ? AND phone = ? AND address = ?
           AND subdistrict = ? AND district = ? AND province = ? AND postcode = ?`,
      )
      .get(accountId, a.recipientName, a.phone, a.address, a.subdistrict, a.district, a.province, a.postcode) as
      | { id: number }
      | undefined;
    if (same) return { ok: true as const, id: same.id };

    const { count } = db.prepare("SELECT count(*) AS count FROM shipping_addresses WHERE account_id = ?").get(accountId) as {
      count: number;
    };
    if (count >= MAX_ADDRESSES) return { ok: false as const, errors: { form: ADDRESS_LIMIT } };

    const id = db
      .prepare(
        `INSERT INTO shipping_addresses
           (account_id, recipient_name, phone, address, subdistrict, district, province, postcode, is_default, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        accountId,
        a.recipientName,
        a.phone,
        a.address,
        a.subdistrict,
        a.district,
        a.province,
        a.postcode,
        count === 0 ? 1 : 0,
        now.toISOString(),
        now.toISOString(),
      ).lastInsertRowid;
    return { ok: true as const, id: Number(id) };
  });
}

/** CHK-002 แก้ที่อยู่ คำสั่งซื้อที่สร้างแล้วเก็บสำเนาของตัวเองจึงไม่เปลี่ยนตาม */
export function updateAddress(
  db: Db,
  accountId: number,
  addressId: number,
  input: AddressInput,
  now: Date = new Date(),
): SaveResult {
  const a = clean(input);
  const errors = validate(a);
  if (errors) return { ok: false, errors };

  const { changes } = db
    .prepare(
      `UPDATE shipping_addresses
       SET recipient_name = ?, phone = ?, address = ?, subdistrict = ?, district = ?, province = ?, postcode = ?, updated_at = ?
       WHERE id = ? AND account_id = ?`,
    )
    .run(a.recipientName, a.phone, a.address, a.subdistrict, a.district, a.province, a.postcode, now.toISOString(), addressId, accountId);
  return changes === 0 ? { ok: false, errors: { form: ADDRESS_GONE } } : { ok: true, id: addressId };
}

/** CHK-003 ลบที่อยู่ ถ้าเป็นที่อยู่หลัก ที่เพิ่มล่าสุดในที่เหลือเป็นแทน false ถ้าไม่พบที่อยู่นี้แล้ว */
export function deleteAddress(db: Db, accountId: number, addressId: number): boolean {
  return transaction(db, () => {
    const { changes } = db.prepare("DELETE FROM shipping_addresses WHERE id = ? AND account_id = ?").run(addressId, accountId);
    if (changes === 0) return false;
    db.prepare(
      `UPDATE shipping_addresses SET is_default = 1
       WHERE id = (SELECT id FROM shipping_addresses WHERE account_id = ? ORDER BY ${ORDER} LIMIT 1)
         AND NOT EXISTS (SELECT 1 FROM shipping_addresses WHERE account_id = ? AND is_default = 1)`,
    ).run(accountId, accountId);
    return true;
  });
}

/** CHK-003 ตั้งเป็นที่อยู่หลัก ที่อยู่หลักเดิมเลิกเป็น false ถ้าไม่พบที่อยู่นี้แล้ว */
export function setDefaultAddress(db: Db, accountId: number, addressId: number, now: Date = new Date()): boolean {
  return transaction(db, () => {
    if (!getAddress(db, accountId, addressId)) return false;
    db.prepare("UPDATE shipping_addresses SET is_default = 0 WHERE account_id = ? AND is_default = 1 AND id <> ?").run(
      accountId,
      addressId,
    );
    db.prepare("UPDATE shipping_addresses SET is_default = 1, updated_at = ? WHERE id = ?").run(now.toISOString(), addressId);
    return true;
  });
}
