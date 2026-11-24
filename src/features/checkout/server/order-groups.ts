import { releaseCancelledOrderStock } from "@/features/stock/server/reservation";
import { transaction, type Db } from "@/shared/db";
import { ORDER_STATUS, type OrderStatus } from "@/shared/statuses";

/** เวลาจ่ายเงินนับจากกดสั่งซื้อ (CHK-005 CHK-008) */
export const PAYMENT_WINDOW_MS = 30 * 60 * 1000;

/** ความถี่ของรอบตรวจหมดเวลาจ่ายเงิน requirement ให้เห็น `ยกเลิก` ภายใน 1 นาทีหลังครบเวลา (CHK-Q03) */
export const DEADLINE_CHECK_INTERVAL_MS = 15 * 1000;

/** เหตุผลที่แสดงกับคำสั่งซื้อที่ `ยกเลิก` */
export const CANCEL_REASON = {
  buyer: "ผู้ซื้อยกเลิก",
  paymentTimeout: "หมดเวลาจ่ายเงิน",
  deliveryFailed: "ส่งไม่สำเร็จ",
} as const;

export const PAYMENT_EXPIRED_MESSAGE = "คำสั่งซื้อนี้หมดเวลาจ่ายเงินแล้ว";

export type OrderGroupOrder = {
  id: number;
  orderNo: string;
  shopId: number;
  shopName: string;
  status: OrderStatus;
  itemsTotal: number;
  shippingFee: number;
  total: number;
  cancelReason: string | null;
};

export type OrderGroup = {
  id: number;
  buyerAccountId: number;
  /** ยอดรวมที่ต้องจ่ายของทุกคำสั่งซื้อในกลุ่ม เป็นบาท */
  total: number;
  createdAt: string;
  /** เวลาหมดเขตจ่ายเงินแบบ ISO UTC เท่ากันทุกคำสั่งซื้อในกลุ่ม */
  paymentDeadline: string;
  orders: OrderGroupOrder[];
};

/** กลุ่มคำสั่งซื้อพร้อมเวลาหมดเขตและยอดรวม null ถ้าไม่มีหรือเป็นของบัญชีอื่น */
export function getOrderGroup(db: Db, groupId: number, buyerAccountId: number): OrderGroup | null {
  if (!Number.isSafeInteger(groupId)) return null;
  const group = db
    .prepare("SELECT id, buyer_account_id, total, created_at, payment_deadline FROM order_groups WHERE id = ? AND buyer_account_id = ?")
    .get(groupId, buyerAccountId);
  if (!group) return null;
  const orders = db
    .prepare(
      `SELECT o.id, o.order_no, o.shop_id, s.name AS shop_name, o.status, o.items_total, o.shipping_fee, o.total, o.cancel_reason
       FROM orders o JOIN shops s ON s.id = o.shop_id WHERE o.group_id = ? ORDER BY o.id`,
    )
    .all(groupId);
  return {
    id: Number(group.id),
    buyerAccountId: Number(group.buyer_account_id),
    total: Number(group.total),
    createdAt: String(group.created_at),
    paymentDeadline: String(group.payment_deadline),
    orders: orders.map((row) => ({
      id: Number(row.id),
      orderNo: String(row.order_no),
      shopId: Number(row.shop_id),
      shopName: String(row.shop_name),
      status: row.status as OrderStatus,
      itemsTotal: Number(row.items_total),
      shippingFee: Number(row.shipping_fee),
      total: Number(row.total),
      cancelReason: row.cancel_reason === null ? null : String(row.cancel_reason),
    })),
  };
}

/**
 * ยกเลิกทุกคำสั่งซื้อในกลุ่มที่ยัง `รอจ่ายเงิน` พร้อมกัน แล้วคืนสต็อก (CHK-008 CHK-011 INV-013)
 * คืนจำนวนคำสั่งซื้อที่ยกเลิกในครั้งนี้ ได้ 0 ถ้าจ่ายแล้วหรือถูกยกเลิกไปก่อน จึงยกเลิกสองทางพร้อมกันได้โดยสต็อกคืนครั้งเดียว
 */
export function cancelAwaitingPaymentGroup(db: Db, groupId: number, reason: string, now: Date = new Date()): number {
  return transaction(db, () => {
    const cancelled = db
      .prepare(
        `UPDATE orders SET status = ?, cancelled_at = ?, cancel_reason = ?
         WHERE group_id = ? AND status = ? RETURNING id`,
      )
      .all(ORDER_STATUS.cancelled, now.toISOString(), reason, groupId, ORDER_STATUS.awaitingPayment);
    for (const order of cancelled) releaseCancelledOrderStock(db, Number(order.id), now);
    return cancelled.length;
  });
}

/** ยกเลิกทุกกลุ่มที่เลยเวลาหมดเขตจ่ายเงินแล้ว (CHK-008 INV-014) คืนจำนวนกลุ่มที่ยกเลิก */
export function expireOverdueOrderGroups(db: Db, now: Date = new Date()): number {
  const overdue = db
    .prepare(
      `SELECT DISTINCT o.group_id FROM orders o JOIN order_groups g ON g.id = o.group_id
       WHERE o.status = ? AND g.payment_deadline <= ?`,
    )
    .all(ORDER_STATUS.awaitingPayment, now.toISOString());
  return overdue.filter((row) => cancelAwaitingPaymentGroup(db, Number(row.group_id), CANCEL_REASON.paymentTimeout, now) > 0).length;
}

export type PayableCheck =
  | { payable: true; group: OrderGroup }
  | { payable: false; reason: "not-found" | "expired" | "not-awaiting-payment"; group: OrderGroup | null };

/**
 * ตรวจก่อนพาผู้ซื้อไปจ่ายเงิน ครบเวลาแล้วจ่ายไม่ได้ทันที (CHK-008)
 * ถ้าเลยเวลาแต่รอบตรวจยังมาไม่ถึง จะยกเลิกกลุ่มให้เลย หน้าที่โหลดใหม่จึงเห็น `ยกเลิก`
 * reason "expired" ให้แสดง PAYMENT_EXPIRED_MESSAGE
 */
export function checkOrderGroupPayable(db: Db, groupId: number, buyerAccountId: number, now: Date = new Date()): PayableCheck {
  let group = getOrderGroup(db, groupId, buyerAccountId);
  if (!group) return { payable: false, reason: "not-found", group: null };
  const awaiting = group.orders.some((order) => order.status === ORDER_STATUS.awaitingPayment);
  if (awaiting && now.getTime() < new Date(group.paymentDeadline).getTime()) return { payable: true, group };
  if (awaiting) {
    cancelAwaitingPaymentGroup(db, groupId, CANCEL_REASON.paymentTimeout, now);
    group = getOrderGroup(db, groupId, buyerAccountId)!;
  }
  const expired = group.orders.some((order) => order.cancelReason === CANCEL_REASON.paymentTimeout);
  return { payable: false, reason: expired ? "expired" : "not-awaiting-payment", group };
}

const timer = globalThis as { blanksongDeadlineTimer?: ReturnType<typeof setInterval> };

/**
 * เริ่มรอบตรวจหมดเวลาจ่ายเงินในโปรเซสของแอป ไม่ต้องมีใครเปิดหน้าเว็บ
 * ตรวจทันทีหนึ่งครั้ง จึงยกเลิกคำสั่งซื้อที่ครบเวลาระหว่างที่แอปปิดอยู่ แล้วตรวจซ้ำทุก intervalMs
 * เรียกซ้ำได้ ครั้งหลังไม่เริ่มรอบใหม่ คืนฟังก์ชันหยุดรอบตรวจ
 */
export function startPaymentDeadlineTimer(getDb: () => Db, intervalMs = DEADLINE_CHECK_INTERVAL_MS): () => void {
  const stop = () => {
    clearInterval(timer.blanksongDeadlineTimer);
    timer.blanksongDeadlineTimer = undefined;
  };
  if (timer.blanksongDeadlineTimer) return stop;
  const run = () => {
    try {
      expireOverdueOrderGroups(getDb(), new Date());
    } catch (error) {
      console.error("ตรวจหมดเวลาจ่ายเงินไม่สำเร็จ จะลองใหม่รอบถัดไป", error);
    }
  };
  timer.blanksongDeadlineTimer = setInterval(run, intervalMs);
  timer.blanksongDeadlineTimer.unref?.();
  run();
  return stop;
}
