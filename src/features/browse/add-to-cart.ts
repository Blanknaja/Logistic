// จุดส่งต่อจากปุ่ม "ใส่ตะกร้า" ในหน้ารายละเอียดสินค้า (BRW-010) ไปยังตะกร้า (CRT-001)
// หน้าส่ง server action ที่มีรูปแบบนี้ให้ AddToCartForm ทาง prop

export type AddToCartInput = {
  variantId: number;
  /** ตามที่ผู้ซื้อพิมพ์ ตะกร้าเป็นคนตรวจ (CRT-001 CRT-005) */
  quantity: string;
};

/** ข้อความที่แสดงใต้ปุ่ม ok เป็น false เมื่อไม่ได้เพิ่มลงตะกร้า */
export type AddToCartResult = { ok: boolean; message: string };

export type AddToCart = (input: AddToCartInput) => Promise<AddToCartResult>;
