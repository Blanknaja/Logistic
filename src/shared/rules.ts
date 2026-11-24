// กฎตรวจข้อมูลที่หลาย feature ใช้ร่วมกัน

/** เบอร์โทรของบัญชี ร้าน และที่อยู่จัดส่ง: ตัวเลข 10 หลัก ขึ้นต้นด้วย 0 */
export const isPhone = (value: string) => /^0\d{9}$/.test(value);

export type ImageType = "image/jpeg" | "image/png";

const startsWith = (bytes: Uint8Array, signature: number[]) => signature.every((byte, i) => bytes[i] === byte);

/** ชนิดรูปจากไบต์ต้นไฟล์ ไม่เชื่อชื่อไฟล์หรือชนิดที่เบราว์เซอร์บอก null ถ้าไม่ใช่ JPG หรือ PNG */
export function detectImageType(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  return null;
}
