import { transaction, type Db } from "@/shared/db";
import { ORDER_STATUS, PARCEL_STATUS, RECEIPT_CONFIRMED_BY, type ReceiptConfirmedBy } from "@/shared/statuses";
import { AUTO_CONFIRM_AFTER_MS, findViewableParcel, PARCEL_NOT_FOUND, type Viewer } from "./tracking";

export const RECEIPT_ERROR = {
  notDelivered: "กดได้หลังพัสดุเป็น ส่งสำเร็จ",
  alreadyCompleted: "คำสั่งซื้อนี้สำเร็จแล้ว",
  buyerOnly: "เฉพาะผู้ซื้อกดได้",
} as const;

/** รอบที่ระบบตรวจคำสั่งซื้อที่ครบ 7 วัน requirement ยอมให้ช้าได้ไม่เกิน 5 นาที (DLV-Q03) */
export const AUTO_CONFIRM_CHECK_MS = 60 * 1000;

// เงื่อนไข status ใน WHERE ทำให้ผู้ซื้อกับระบบที่ยืนยันพร้อมกัน สำเร็จได้ฝ่ายเดียว
function markReceived(db: Db, parcelId: number, orderId: number, by: ReceiptConfirmedBy, now: Date): boolean {
  const at = now.toISOString();
  return transaction(db, () => {
    const order = db
      .prepare("UPDATE orders SET status = ?, completed_at = ? WHERE id = ? AND status = ?")
      .run(ORDER_STATUS.completed, at, orderId, ORDER_STATUS.shipping);
    if (order.changes === 0) return false;
    db.prepare(
      "UPDATE parcels SET receipt_confirmed_at = ?, receipt_confirmed_by = ?, updated_at = ? WHERE id = ? AND receipt_confirmed_at IS NULL",
    ).run(at, by, at, parcelId);
    return true;
  });
}

/** ผู้ซื้อเจ้าของคำสั่งซื้อกด "ได้รับสินค้าแล้ว" (DLV-012) */
export function confirmReceipt(
  db: Db,
  trackingNo: string,
  viewer: Viewer,
  now: Date = new Date(),
): { ok: true } | { ok: false; error: string } {
  return transaction(db, () => {
    const found = findViewableParcel(db, trackingNo, viewer);
    if (!found) return { ok: false, error: PARCEL_NOT_FOUND };
    const { row, isBuyer } = found;
    if (!isBuyer) return { ok: false, error: RECEIPT_ERROR.buyerOnly };
    if (row.order_status === ORDER_STATUS.completed) return { ok: false, error: RECEIPT_ERROR.alreadyCompleted };
    if (row.status !== PARCEL_STATUS.delivered || row.order_status !== ORDER_STATUS.shipping) {
      return { ok: false, error: RECEIPT_ERROR.notDelivered };
    }
    markReceived(db, row.id, row.order_id, RECEIPT_CONFIRMED_BY.buyer, now);
    return { ok: true };
  });
}

/**
 * ปิดทุกคำสั่งซื้อที่พัสดุเป็น ส่งสำเร็จ มาครบ 7 วันแล้วและผู้ซื้อยังไม่กดยืนยัน (DLV-013)
 * เรียกซ้ำได้ตลอด คืนจำนวนคำสั่งซื้อที่ปิดในครั้งนี้
 */
export function completeDueReceipts(db: Db, now: Date = new Date()): number {
  const cutoff = new Date(now.getTime() - AUTO_CONFIRM_AFTER_MS).toISOString();
  return transaction(db, () => {
    const due = db
      .prepare(
        `SELECT p.id, p.order_id FROM parcels p JOIN orders o ON o.id = p.order_id
         WHERE p.status = ? AND p.delivered_at <= ? AND o.status = ?`,
      )
      .all(PARCEL_STATUS.delivered, cutoff, ORDER_STATUS.shipping) as { id: number; order_id: number }[];
    return due.filter((parcel) => markReceived(db, parcel.id, parcel.order_id, RECEIPT_CONFIRMED_BY.system, now)).length;
  });
}

/** รัน completeDueReceipts ทันทีหนึ่งครั้ง แล้วทุก 1 นาที คืนฟังก์ชันสำหรับหยุด */
export function startReceiptAutoCompletion(db: Db): () => void {
  const run = () => {
    try {
      completeDueReceipts(db);
    } catch (error) {
      console.error("ปิดคำสั่งซื้อที่ครบ 7 วันไม่สำเร็จ จะลองใหม่รอบถัดไป", error);
    }
  };
  run();
  const timer = setInterval(run, AUTO_CONFIRM_CHECK_MS);
  // ไม่ให้ตัวจับเวลานี้ค้างโปรเซสไว้ตอนแอปกำลังปิด
  timer.unref();
  return () => clearInterval(timer);
}
