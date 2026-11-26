import { notifyStockEmpty } from "@/features/notification/server/events";
import { transaction, type Db } from "@/shared/db";
import { ORDER_STATUS, STOCK_CHANGE_REASON } from "@/shared/statuses";

export type StockLine = { variantId: number; quantity: number };

/** ข้อความที่ผู้ซื้อเห็นเมื่อสต็อกไม่พอ (INV-010) null เมื่อพอ */
export function stockShortageMessage(stock: number, quantity: number): string | null {
  if (stock >= quantity) return null;
  return stock === 0 ? "สินค้าหมด" : `เหลือ ${stock} ชิ้น`;
}

/**
 * จองสต็อกของคำสั่งซื้อหนึ่งรายการ (INV-009) ลดสต็อกและเขียนประวัติหนึ่งบรรทัดต่อแบบย่อย
 * ผู้เรียกต้องตรวจสต็อกทุกรายการก่อน และเรียกใน transaction เดียวกับที่สร้างคำสั่งซื้อ
 * ถ้าแบบย่อยใดไม่พอจะโยน error ให้ transaction ย้อนทั้งหมด สต็อกจึงไม่ติดลบแม้มีคนแย่งกัน
 */
export function reserveOrderStock(db: Db, orderId: number, lines: StockLine[], now: Date): void {
  const take = db.prepare("UPDATE variants SET stock = stock - ? WHERE id = ? AND stock >= ? RETURNING stock");
  for (const { variantId, quantity } of lines) {
    const row = take.get(quantity, variantId, quantity);
    if (!row) throw new Error(`สต็อกของแบบย่อย ${variantId} ไม่พอ ต้องตรวจก่อนจอง`);
    addHistory(db, variantId, STOCK_CHANGE_REASON.reserved, -quantity, Number(row.stock), orderId, now);
    if (Number(row.stock) === 0 && quantity > 0) notifyStockEmpty(db, variantId, orderId, now);
  }
}

/**
 * คืนสต็อกของคำสั่งซื้อที่เป็น `ยกเลิก` แล้ว ตามจำนวนที่สั่ง (INV-013)
 * คืนครั้งเดียวต่อคำสั่งซื้อ เรียกซ้ำได้ ครั้งหลังไม่ทำอะไร
 * คืน true เมื่อคืนสต็อกในครั้งนี้
 */
export function releaseCancelledOrderStock(db: Db, orderId: number, now: Date = new Date()): boolean {
  return transaction(db, () => {
    const order = db.prepare("SELECT status FROM orders WHERE id = ?").get(orderId);
    if (!order) throw new Error(`ไม่มีคำสั่งซื้อ ${orderId}`);
    if (order.status !== ORDER_STATUS.cancelled) {
      throw new Error(`คืนสต็อกได้เฉพาะคำสั่งซื้อที่ ${ORDER_STATUS.cancelled} แล้ว คำสั่งซื้อ ${orderId} เป็น ${order.status}`);
    }
    const released = db
      .prepare("SELECT 1 FROM stock_history WHERE order_id = ? AND reason = ? LIMIT 1")
      .get(orderId, STOCK_CHANGE_REASON.returned);
    if (released) return false;

    const items = db
      .prepare("SELECT variant_id, sum(quantity) AS quantity FROM order_items WHERE order_id = ? GROUP BY variant_id ORDER BY variant_id")
      .all(orderId);
    const give = db.prepare("UPDATE variants SET stock = stock + ? WHERE id = ? RETURNING stock");
    for (const item of items) {
      const quantity = Number(item.quantity);
      const row = give.get(quantity, Number(item.variant_id));
      addHistory(db, Number(item.variant_id), STOCK_CHANGE_REASON.returned, quantity, Number(row?.stock), orderId, now);
    }
    return true;
  });
}

/** จำนวนที่จองอยู่ของแบบย่อย คือจำนวนในคำสั่งซื้อที่ยัง `รอจ่ายเงิน` */
export function reservedQuantity(db: Db, variantId: number): number {
  const row = db
    .prepare(
      `SELECT coalesce(sum(i.quantity), 0) AS n FROM order_items i JOIN orders o ON o.id = i.order_id
       WHERE i.variant_id = ? AND o.status = ?`,
    )
    .get(variantId, ORDER_STATUS.awaitingPayment);
  return Number(row?.n);
}

function addHistory(db: Db, variantId: number, reason: string, change: number, stockAfter: number, orderId: number, now: Date) {
  db.prepare(
    "INSERT INTO stock_history (variant_id, reason, change, stock_after, order_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(variantId, reason, change, stockAfter, orderId, now.toISOString());
}
