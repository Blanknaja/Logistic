/** รายการที่แบ่งหน้าทุกหน้าของชุด 1 แสดงครั้งละ 20 รายการ */
export const PAGE_SIZE = 20;

/** จำนวนหน้าของรายการ total รายการ ไม่มีรายการก็นับเป็น 1 หน้า */
export const pageCount = (total: number, pageSize = PAGE_SIZE) => Math.max(1, Math.ceil(total / pageSize));

/** หน้าที่แสดงจริงจากหน้าที่ขอ ค่าที่ไม่ใช่เลขหน้าได้หน้า 1 และหน้าที่เกินได้หน้าสุดท้าย */
export const clampPage = (requested: number, pages: number) => (Number.isSafeInteger(requested) ? Math.min(Math.max(requested, 1), pages) : 1);
