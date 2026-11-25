/** รายการที่แบ่งหน้าทุกหน้าของชุด 1 แสดงครั้งละ 20 รายการ */
export const PAGE_SIZE = 20;

/** จำนวนหน้าของรายการ total รายการ ไม่มีรายการก็นับเป็น 1 หน้า */
export const pageCount = (total: number) => Math.max(1, Math.ceil(total / PAGE_SIZE));
