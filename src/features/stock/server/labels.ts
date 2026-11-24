// ใช้ทั้งฝั่งเซิร์ฟเวอร์และในเบราว์เซอร์ ห้าม import ฐานข้อมูล

/** ป้ายสต็อก เกณฑ์เดียวทั้งระบบ ผู้ขายตั้งเองไม่ได้ (INV-002) */
export const STOCK_LABEL = {
  low: "ใกล้หมด",
  out: "หมด",
} as const;

export type StockLabel = (typeof STOCK_LABEL)[keyof typeof STOCK_LABEL];

export const LOW_STOCK_MAX = 5;

/** ป้ายดูจากสต็อกอย่างเดียว ไม่นับจำนวนที่จองอยู่ */
export function stockLabel(stock: number): StockLabel | null {
  if (stock === 0) return STOCK_LABEL.out;
  return stock <= LOW_STOCK_MAX ? STOCK_LABEL.low : null;
}

/** ข้อความใต้ช่องกรอกเมื่อจำนวนไม่ถูกต้อง (INV-005) */
export const INVALID_STOCK_MESSAGE = "กรอกจำนวนเต็มตั้งแต่ 0 ถึง 999,999";
