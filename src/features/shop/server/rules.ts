import { PROVINCES } from "@/shared/provinces";
import { detectImageType, isPhone } from "@/shared/rules";

// กติกาของข้อมูลร้าน (SHP-003 SHP-008) ไม่แตะฐานข้อมูล หน้าเว็บจึงใช้ค่าคงที่ในไฟล์นี้ได้ด้วย

/** ข้อมูลร้านที่ผู้ขายกรอกในหน้าเปิดร้านและหน้าตั้งค่าร้าน */
export type ShopInput = {
  name: string;
  description: string;
  senderName: string;
  phone: string;
  address: string;
  subdistrict: string;
  district: string;
  province: string;
  postcode: string;
};

export type ShopField = keyof ShopInput | "logo";

/** ข้อความใต้ช่องที่ผิด */
export type ShopErrors = Partial<Record<ShopField, string>>;

export const SHOP_FIELDS: (keyof ShopInput)[] = [
  "name",
  "description",
  "senderName",
  "phone",
  "address",
  "subdistrict",
  "district",
  "province",
  "postcode",
];

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_TYPES = ["image/jpeg", "image/png"] as const;
export type LogoType = (typeof LOGO_TYPES)[number];

export const SHOP_ERRORS = {
  name: "ชื่อร้านต้องมี 3 ถึง 30 ตัวอักษร",
  nameTaken: "ชื่อร้านนี้มีคนใช้แล้ว",
  description: "คำอธิบายร้านต้องไม่เกิน 500 ตัวอักษร",
  senderName: "ชื่อผู้ส่งต้องมี 2 ถึง 50 ตัวอักษร",
  phone: "เบอร์โทรต้องเป็นตัวเลข 10 หลัก ขึ้นต้นด้วย 0",
  address: "รายละเอียดที่อยู่ต้องมี 5 ถึง 200 ตัวอักษร",
  subdistrict: "กรุณากรอกตำบลหรือแขวง ไม่เกิน 50 ตัวอักษร",
  district: "กรุณากรอกอำเภอหรือเขต ไม่เกิน 50 ตัวอักษร",
  province: "กรุณาเลือกจังหวัด",
  postcode: "กรุณากรอกรหัสไปรษณีย์ 5 หลัก",
  logo: "ใช้ได้เฉพาะรูป JPG หรือ PNG ขนาดไม่เกิน 2 MB",
} as const;

// นับเป็นตัวอักษร ไม่ใช่หน่วยของ UTF-16
const length = (value: string) => [...value].length;
const between = (value: string, min: number, max: number) => length(value) >= min && length(value) <= max;

/** ตัดช่องว่างหน้าหลังทุกช่อง แล้วตรวจตามกติกาของ SHP-003 */
export function checkShopInput(input: ShopInput): { value: ShopInput; errors: ShopErrors } {
  const value = Object.fromEntries(SHOP_FIELDS.map((field) => [field, (input[field] ?? "").trim()])) as ShopInput;
  const errors: ShopErrors = {};
  if (!between(value.name, 3, 30)) errors.name = SHOP_ERRORS.name;
  if (length(value.description) > 500) errors.description = SHOP_ERRORS.description;
  if (!between(value.senderName, 2, 50)) errors.senderName = SHOP_ERRORS.senderName;
  if (!isPhone(value.phone)) errors.phone = SHOP_ERRORS.phone;
  if (!between(value.address, 5, 200)) errors.address = SHOP_ERRORS.address;
  if (!between(value.subdistrict, 1, 50)) errors.subdistrict = SHOP_ERRORS.subdistrict;
  if (!between(value.district, 1, 50)) errors.district = SHOP_ERRORS.district;
  if (!(PROVINCES as readonly string[]).includes(value.province)) errors.province = SHOP_ERRORS.province;
  if (!/^\d{5}$/.test(value.postcode)) errors.postcode = SHOP_ERRORS.postcode;
  return { value, errors };
}

/** ชนิดของรูปจากไบต์แรกของไฟล์ ไม่เชื่อชนิดที่เบราว์เซอร์บอก null ถ้าไม่ใช่ JPG หรือ PNG หรือใหญ่เกิน 2 MB */
export function logoType(bytes: Uint8Array): LogoType | null {
  if (bytes.length === 0 || bytes.length > LOGO_MAX_BYTES) return null;
  return detectImageType(bytes);
}

/** ตัวอักษรตัวแรกของชื่อร้าน ใช้แทนโลโก้ของร้านที่ยังไม่มีโลโก้ (SHP-008) */
export function logoLetter(name: string): string {
  return [...name.trim()][0] ?? "";
}

/** ข้อความของทั้งฟอร์ม อยู่นอกไฟล์ "use client" เพราะหน้าฝั่งเซิร์ฟเวอร์ใช้ด้วย ค่าที่ import จากไฟล์ client ไม่มีค่าจริงฝั่งเซิร์ฟเวอร์ */
export const SHOP_FORM_MESSAGES = {
  openFailed: "เปิดร้านไม่สำเร็จ ลองใหม่อีกครั้ง",
  saveFailed: "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง",
  uploadFailed: "อัปโหลดรูปไม่สำเร็จ ลองใหม่อีกครั้ง",
  admin: "บัญชีนี้เปิดร้านไม่ได้",
  suspended: "ร้านถูกระงับ แก้การตั้งค่าร้านไม่ได้",
  "not-found": "ไม่พบหน้านี้",
} as const;
