// คำสถานะทุกคำของชุด 1 ตามส่วน "ข้อมูลและสถานะ" ใน docs/requirements/
// ค่าเหล่านี้คือค่าที่เก็บในฐานข้อมูลจริง ใช้จากไฟล์นี้ ห้ามพิมพ์คำเอง

export const ACCOUNT_STATUS = {
  active: "ใช้งานได้",
  suspended: "ถูกระงับ",
} as const;

export const SHOP_STATUS = {
  open: "เปิดอยู่",
  suspended: "ถูกระงับ",
} as const;

export const PRODUCT_STATUS = {
  draft: "ร่าง",
  onSale: "ขายอยู่",
  hidden: "ซ่อน",
  deleted: "ลบแล้ว",
} as const;

export const STOCK_CHANGE_REASON = {
  sellerEdit: "ผู้ขายแก้",
  reserved: "จองจากคำสั่งซื้อ",
  returned: "คืนจากคำสั่งซื้อ",
} as const;

export const ORDER_STATUS = {
  awaitingPayment: "รอจ่ายเงิน",
  paid: "จ่ายแล้ว",
  shipping: "กำลังจัดส่ง",
  completed: "สำเร็จ",
  cancelled: "ยกเลิก",
} as const;

export const PAYMENT_STATUS = {
  pending: "รอผล",
  succeeded: "สำเร็จ",
  failed: "ไม่สำเร็จ",
  abandoned: "เลิกรอ",
  succeededUnused: "สำเร็จแต่ไม่ถูกใช้",
} as const;

export const PAYMENT_METHOD = {
  card: "บัตร",
  promptPay: "PromptPay",
} as const;

export const PARCEL_STATUS = {
  awaitingPacking: "รอร้านจัดของ",
  handedOver: "ร้านส่งของแล้ว",
  inTransit: "อยู่ระหว่างขนส่ง",
  outForDelivery: "กำลังนำส่ง",
  delivered: "ส่งสำเร็จ",
  failed: "ส่งไม่สำเร็จ",
} as const;

export const RECEIPT_CONFIRMED_BY = {
  buyer: "ผู้ซื้อ",
  system: "ระบบ",
} as const;

type ValueOf<T> = T[keyof T];

export type AccountStatus = ValueOf<typeof ACCOUNT_STATUS>;
export type ShopStatus = ValueOf<typeof SHOP_STATUS>;
export type ProductStatus = ValueOf<typeof PRODUCT_STATUS>;
export type StockChangeReason = ValueOf<typeof STOCK_CHANGE_REASON>;
export type OrderStatus = ValueOf<typeof ORDER_STATUS>;
export type PaymentStatus = ValueOf<typeof PAYMENT_STATUS>;
export type PaymentMethod = ValueOf<typeof PAYMENT_METHOD>;
export type ParcelStatus = ValueOf<typeof PARCEL_STATUS>;
export type ReceiptConfirmedBy = ValueOf<typeof RECEIPT_CONFIRMED_BY>;
