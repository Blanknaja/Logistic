import { createParcelForPaidOrder } from "@/features/delivery/server/parcel-status";
import { transaction, type Db } from "@/shared/db";
import {
  ORDER_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
} from "@/shared/statuses";
import { validateCard, type CardErrors, type CardFields } from "./card";
import { ProviderRejected, ProviderUnavailable, type Charge, type PaymentProvider } from "./provider";

/** รอผู้ให้บริการได้นานสุดเท่านี้ เกินแล้วถือว่าล่ม (PAY-007 PAY-008) */
export const PROVIDER_TIMEOUT_MS = 10_000;

export const UNAVAILABLE_MESSAGE = "จ่ายเงินไม่ได้ตอนนี้ กรุณาลองใหม่ภายหลัง คำสั่งซื้อของคุณยังอยู่";
export const minutesLeftText = (minutes: number) => `เหลือเวลาจ่าย ${minutes} นาที`;

const FINAL: PaymentStatus[] = [PAYMENT_STATUS.succeeded, PAYMENT_STATUS.failed, PAYMENT_STATUS.succeededUnused];

const REASONS: Record<string, string> = {
  insufficient_fund: "บัตรถูกปฏิเสธ: วงเงินไม่พอ",
  stolen_or_lost_card: "บัตรถูกปฏิเสธ: บัตรถูกแจ้งหายหรือถูกขโมย",
  payment_rejected: "บัตรถูกปฏิเสธ: ธนาคารไม่อนุมัติ",
  failed_fraud_check: "บัตรถูกปฏิเสธ: ไม่ผ่านการตรวจความปลอดภัย",
  invalid_account_number: "บัตรถูกปฏิเสธ: เลขบัญชีไม่ถูกต้อง",
  expired_card: "บัตรถูกปฏิเสธ: บัตรหมดอายุ",
  invalid_card: "บัตรถูกปฏิเสธ: ข้อมูลบัตรไม่ถูกต้อง หรือไม่ใช่บัตรทดลองของ Omise",
  failed_processing: "จ่ายเงินไม่สำเร็จ: ระบบรับเงินขัดข้อง",
  insufficient_balance: "จ่ายเงินไม่สำเร็จ: ยอดเงินไม่พอ",
  payment_cancelled: "จ่ายเงินไม่สำเร็จ: ผู้จ่ายยกเลิก",
  expired: "จ่ายเงินไม่สำเร็จ: QR หมดอายุ",
};

function failureReason(code: string, message: string | null): string {
  return REASONS[code] ?? `จ่ายเงินไม่สำเร็จ${message ? `: ${message}` : ""}`;
}

type PaymentRow = {
  id: number;
  group_id: number;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  omise_charge_id: string | null;
  failure_reason: string | null;
  card_last4: string | null;
  qr_image_url: string | null;
  started_at: string;
  resolved_at: string | null;
};

type OrderRow = { id: number; order_no: string; status: OrderStatus; total: number; shop_name: string; cancel_reason: string | null };

type GroupData = {
  group: { id: number; buyer_account_id: number; payment_deadline: string };
  orders: OrderRow[];
  payments: PaymentRow[];
};

function readGroup(db: Db, groupId: number, buyerId: number): GroupData | null {
  const group = db.prepare("SELECT id, buyer_account_id, payment_deadline FROM order_groups WHERE id = ?").get(groupId) as
    | GroupData["group"]
    | undefined;
  // กลุ่มของบัญชีอื่นได้ผลเหมือนไม่มีกลุ่มนี้ (PAY-014)
  if (!group || group.buyer_account_id !== buyerId) return null;
  const orders = db
    .prepare(
      `SELECT o.id, o.order_no, o.status, o.total, o.cancel_reason, s.name AS shop_name
       FROM orders o JOIN shops s ON s.id = o.shop_id WHERE o.group_id = ? ORDER BY o.id`,
    )
    .all(groupId) as OrderRow[];
  const payments = db.prepare("SELECT * FROM payments WHERE group_id = ? ORDER BY id").all(groupId) as PaymentRow[];
  return { group, orders, payments };
}

function stateOf({ group, orders, payments }: GroupData, now: Date): "paid" | "closed" | "open" {
  const awaitingOrCancelled: OrderStatus[] = [ORDER_STATUS.awaitingPayment, ORDER_STATUS.cancelled];
  if (payments.some((p) => p.status === PAYMENT_STATUS.succeeded) || orders.some((o) => !awaitingOrCancelled.includes(o.status))) {
    return "paid";
  }
  // เลยเขตจ่ายแล้วจ่ายไม่ได้ แม้ตัวยกเลิกของ CHK-008 ยังไม่ได้เปลี่ยนสถานะคำสั่งซื้อ
  if (orders.length === 0 || orders.some((o) => o.status === ORDER_STATUS.cancelled) || now >= new Date(group.payment_deadline)) {
    return "closed";
  }
  return "open";
}

const minutesLeft = (deadline: string, now: Date) =>
  Math.max(0, Math.ceil((new Date(deadline).getTime() - now.getTime()) / 60_000));

const sumTotals = (orders: OrderRow[]) => orders.reduce((sum, order) => sum + order.total, 0);

// หน้าจ่ายเงิน ----------------------------------------------------------------

export type PaymentView = {
  id: number;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  cardLast4: string | null;
  failureReason: string | null;
  qrImageUrl: string | null;
  chargeId: string | null;
  startedAt: string;
  resolvedAt: string | null;
};

const toView = (row: PaymentRow): PaymentView => ({
  id: row.id,
  method: row.method,
  status: row.status,
  amount: row.amount,
  cardLast4: row.card_last4,
  failureReason: row.failure_reason,
  qrImageUrl: row.qr_image_url,
  chargeId: row.omise_charge_id,
  startedAt: row.started_at,
  resolvedAt: row.resolved_at,
});

export type PayPage = {
  groupId: number;
  amount: number;
  minutesLeft: number;
  orders: { orderNo: string; shopName: string; total: number; status: OrderStatus }[];
  view: "open" | "pending" | "failed" | "paid" | "closed";
  closedByDeadline: boolean;
  pending: PaymentView | null;
  succeeded: PaymentView | null;
  lastFailed: PaymentView | null;
  unused: PaymentView[];
  history: PaymentView[];
  /** การจ่ายเงินที่ผลยังเปลี่ยนได้ ต้องถามผู้ให้บริการต่อ */
  unresolved: PaymentView[];
  /** หน้าเปิดค้างต้องถามผลซ้ำเรื่อยๆ (PAY-004 PAY-013) */
  poll: boolean;
};

/** ข้อมูลหน้าจ่ายเงินของกลุ่มคำสั่งซื้อ null ถ้าไม่มีกลุ่มนี้หรือเป็นของบัญชีอื่น */
export function getPayPage(db: Db, buyerId: number, groupId: number, now: Date = new Date()): PayPage | null {
  const data = readGroup(db, groupId, buyerId);
  if (!data) return null;
  const state = stateOf(data, now);
  const history = data.payments.map(toView);
  const pending = history.find((p) => p.status === PAYMENT_STATUS.pending) ?? null;
  const latest = history.at(-1);
  const view = state !== "open" ? state : pending ? "pending" : latest?.status === PAYMENT_STATUS.failed ? "failed" : "open";
  const unresolved = history.filter(
    (p) => p.chargeId && (p.status === PAYMENT_STATUS.pending || p.status === PAYMENT_STATUS.abandoned),
  );
  return {
    groupId,
    amount: sumTotals(data.orders),
    minutesLeft: minutesLeft(data.group.payment_deadline, now),
    orders: data.orders.map((o) => ({ orderNo: o.order_no, shopName: o.shop_name, total: o.total, status: o.status })),
    view,
    closedByDeadline:
      state === "closed" &&
      (now >= new Date(data.group.payment_deadline) || data.orders.some((o) => o.cancel_reason === "หมดเวลาจ่ายเงิน")),
    pending,
    succeeded: history.find((p) => p.status === PAYMENT_STATUS.succeeded) ?? null,
    lastFailed: view === "failed" ? (latest ?? null) : null,
    unused: history.filter((p) => p.status === PAYMENT_STATUS.succeededUnused),
    history,
    unresolved,
    poll: view === "open" || view === "pending" || view === "failed" || unresolved.length > 0,
  };
}

// ใช้ผลจากผู้ให้บริการ ---------------------------------------------------------

/**
 * ที่เดียวในระบบที่เปลี่ยนคำสั่งซื้อของกลุ่มคำสั่งซื้อเป็น `จ่ายแล้ว` เรียกเมื่อผู้ให้บริการยืนยันว่าการจ่ายเงินนี้สำเร็จ (PAY-005)
 * คำสั่งซื้อทุกรายการที่ครอบคลุมต้องยัง `รอจ่ายเงิน` และยังไม่เลยเขตจ่าย ไม่เช่นนั้นเงินนี้เป็น `สำเร็จแต่ไม่ถูกใช้` (PAY-010)
 * สร้างพัสดุของทุกคำสั่งซื้อที่เพิ่งเป็น `จ่ายแล้ว` ในการบันทึกเดียวกัน (DLV-001) เรียกซ้ำได้ ครั้งหลังได้รายการว่าง
 */
export function markGroupPaid(db: Db, paymentId: number, now: Date = new Date()): { status: PaymentStatus; paidOrderIds: number[] } {
  return transaction(db, () => {
    const payment = db
      .prepare(
        `SELECT p.status, p.group_id, g.payment_deadline FROM payments p
         JOIN order_groups g ON g.id = p.group_id WHERE p.id = ?`,
      )
      .get(paymentId) as { status: PaymentStatus; group_id: number; payment_deadline: string } | undefined;
    if (!payment) throw new Error(`ไม่มีการจ่ายเงิน ${paymentId}`);
    if (FINAL.includes(payment.status)) return { status: payment.status, paidOrderIds: [] };

    const orders = db
      .prepare("SELECT o.id, o.status FROM payment_orders po JOIN orders o ON o.id = po.order_id WHERE po.payment_id = ?")
      .all(paymentId) as { id: number; status: OrderStatus }[];
    const at = now.toISOString();
    const usable =
      orders.length > 0 &&
      orders.every((o) => o.status === ORDER_STATUS.awaitingPayment) &&
      now < new Date(payment.payment_deadline);
    if (!usable) {
      db.prepare("UPDATE payments SET status = ?, resolved_at = ? WHERE id = ?").run(PAYMENT_STATUS.succeededUnused, at, paymentId);
      return { status: PAYMENT_STATUS.succeededUnused, paidOrderIds: [] };
    }

    const markPaid = db.prepare("UPDATE orders SET status = ?, paid_at = ? WHERE id = ?");
    for (const order of orders) {
      markPaid.run(ORDER_STATUS.paid, at, order.id);
      createParcelForPaidOrder(db, order.id, now);
    }
    db.prepare("UPDATE payments SET status = ? WHERE group_id = ? AND status = ? AND id != ?").run(
      PAYMENT_STATUS.abandoned,
      payment.group_id,
      PAYMENT_STATUS.pending,
      paymentId,
    );
    db.prepare("UPDATE payments SET status = ?, resolved_at = ? WHERE id = ?").run(PAYMENT_STATUS.succeeded, at, paymentId);
    return { status: PAYMENT_STATUS.succeeded, paidOrderIds: orders.map((o) => o.id) };
  });
}

function markFailed(db: Db, paymentId: number, reason: string, now: Date): void {
  db.prepare("UPDATE payments SET status = ?, failure_reason = ?, resolved_at = ? WHERE id = ? AND status IN (?, ?)").run(
    PAYMENT_STATUS.failed,
    reason,
    now.toISOString(),
    paymentId,
    PAYMENT_STATUS.pending,
    PAYMENT_STATUS.abandoned,
  );
}

/** ใช้ผลที่ผู้ให้บริการยืนยันแล้ว ผลที่ใช้ไปแล้ว ยอดไม่ตรง หรือยังรอผล ไม่เปลี่ยนอะไร (PAY-015) */
function applyCharge(db: Db, paymentId: number, charge: Charge, now: Date): PaymentStatus {
  return transaction(db, () => {
    const payment = db.prepare("SELECT status, amount FROM payments WHERE id = ?").get(paymentId) as {
      status: PaymentStatus;
      amount: number;
    };
    if (charge.amount !== payment.amount || charge.status === "pending") return payment.status;
    if (charge.status === "successful") return markGroupPaid(db, paymentId, now).status;
    markFailed(db, paymentId, failureReason(charge.failureCode ?? charge.status, charge.failureMessage), now);
    return PAYMENT_STATUS.failed;
  });
}

/** การจ่ายเงินที่รอผลของกลุ่มนี้เป็น `เลิกรอ` ตัวยกเลิกคำสั่งซื้อต้องเรียกตอนยกเลิกกลุ่ม (PAY-013) */
export function abandonPendingPayments(db: Db, groupId: number): number {
  return Number(
    db.prepare("UPDATE payments SET status = ? WHERE group_id = ? AND status = ?").run(PAYMENT_STATUS.abandoned, groupId, PAYMENT_STATUS.pending)
      .changes,
  );
}

/**
 * ถามผู้ให้บริการ คืนคำตอบพร้อมเวลาที่ได้คำตอบ คือ now บวกเวลาที่รอไป
 * PAY-010 ตัดสินว่าเลยเขตจ่ายหรือยังด้วยเวลาที่ได้คำตอบ ไม่ใช่เวลาที่เริ่มถาม
 */
async function ask<T>(call: () => Promise<T>, timeoutMs: number, now: Date): Promise<{ answer: T; answeredAt: Date }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const askedAt = Date.now();
  const running = Promise.resolve().then(call);
  // ถ้าหมดเวลาไปก่อน ผลที่มาทีหลังไม่มีใครรอแล้ว
  running.catch(() => {});
  try {
    const answer = await Promise.race([
      running,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ProviderUnavailable("ผู้ให้บริการไม่ตอบภายในเวลา")), timeoutMs);
      }),
    ]);
    return { answer, answeredAt: new Date(now.getTime() + Date.now() - askedAt) };
  } finally {
    clearTimeout(timer);
  }
}

// ผู้ซื้อกดจ่ายเงิน -------------------------------------------------------------

type Refusal = { kind: "not-found" } | { kind: "already-paid" } | { kind: "closed" } | { kind: "pending-exists" };

export type PayResult =
  | Refusal
  | { kind: "invalid"; errors: CardErrors }
  | { kind: "unavailable"; minutesLeft: number }
  | { kind: "done"; status: PaymentStatus };

type Started = { kind: "started"; paymentId: number; amount: number; minutesLeft: number };

/** สร้างการจ่ายเงิน `รอผล` หนึ่งรายการ ถ้ากลุ่มยังจ่ายได้และไม่มีรายการที่รอผลอยู่ (PAY-009) */
function beginPayment(db: Db, buyerId: number, groupId: number, method: PaymentMethod, now: Date): Refusal | Started {
  return transaction(db, () => {
    const data = readGroup(db, groupId, buyerId);
    if (!data) return { kind: "not-found" };
    const state = stateOf(data, now);
    if (state === "paid") return { kind: "already-paid" };
    if (state === "closed") return { kind: "closed" };
    if (data.payments.some((p) => p.status === PAYMENT_STATUS.pending)) return { kind: "pending-exists" };

    const amount = sumTotals(data.orders);
    const paymentId = Number(
      db
        .prepare("INSERT INTO payments (group_id, amount, method, status, started_at) VALUES (?, ?, ?, ?, ?)")
        .run(groupId, amount, method, PAYMENT_STATUS.pending, now.toISOString()).lastInsertRowid,
    );
    const cover = db.prepare("INSERT INTO payment_orders (payment_id, order_id, amount) VALUES (?, ?, ?)");
    for (const order of data.orders) cover.run(paymentId, order.id, order.total);
    return { kind: "started", paymentId, amount, minutesLeft: minutesLeft(data.group.payment_deadline, now) };
  });
}

async function runCharge(db: Db, started: Started, request: () => Promise<Charge>, now: Date, timeoutMs: number): Promise<PayResult> {
  let charge: Charge;
  let answeredAt: Date;
  try {
    ({ answer: charge, answeredAt } = await ask(request, timeoutMs, now));
  } catch (error) {
    if (error instanceof ProviderRejected) {
      markFailed(db, started.paymentId, failureReason(error.code, error.message), now);
      return { kind: "done", status: PAYMENT_STATUS.failed };
    }
    if (!(error instanceof ProviderUnavailable)) console.error(error);
    db.prepare("UPDATE payments SET status = ? WHERE id = ? AND status = ?").run(
      PAYMENT_STATUS.abandoned,
      started.paymentId,
      PAYMENT_STATUS.pending,
    );
    return { kind: "unavailable", minutesLeft: started.minutesLeft };
  }
  db.prepare("UPDATE payments SET omise_charge_id = ?, card_last4 = ?, qr_image_url = ? WHERE id = ?").run(
    charge.id,
    charge.cardLast4,
    charge.qrImageUrl,
    started.paymentId,
  );
  return { kind: "done", status: applyCharge(db, started.paymentId, charge, answeredAt) };
}

const describe = (groupId: number) => `Blanksong กลุ่มคำสั่งซื้อ ${groupId}`;

/** PAY-003 จ่ายยอดรวมของกลุ่มด้วยบัตรครั้งเดียว ข้อมูลบัตรส่งต่อให้ผู้ให้บริการเท่านั้น ไม่เก็บ */
export async function payByCard(
  db: Db,
  provider: PaymentProvider,
  input: { buyerId: number; groupId: number; card: CardFields },
  now: Date = new Date(),
  timeoutMs = PROVIDER_TIMEOUT_MS,
): Promise<PayResult> {
  const checked = validateCard(input.card, now);
  if (!checked.ok) return { kind: "invalid", errors: checked.errors };
  const started = beginPayment(db, input.buyerId, input.groupId, PAYMENT_METHOD.card, now);
  if (started.kind !== "started") return started;
  return runCharge(
    db,
    started,
    () => provider.chargeCard({ amount: started.amount, card: checked.card, description: describe(input.groupId) }),
    now,
    timeoutMs,
  );
}

/** PAY-004 สร้าง QR ของ PromptPay สำหรับยอดรวมของกลุ่ม การจ่ายเงินค้าง `รอผล` จนรู้ผล */
export async function payByPromptPay(
  db: Db,
  provider: PaymentProvider,
  input: { buyerId: number; groupId: number },
  now: Date = new Date(),
  timeoutMs = PROVIDER_TIMEOUT_MS,
): Promise<PayResult> {
  const started = beginPayment(db, input.buyerId, input.groupId, PAYMENT_METHOD.promptPay, now);
  if (started.kind !== "started") return started;
  return runCharge(db, started, () => provider.chargePromptPay({ amount: started.amount, description: describe(input.groupId) }), now, timeoutMs);
}

export type CheckResult =
  | { kind: "not-found" }
  | { kind: "no-pending" }
  | { kind: "error" }
  | { kind: "still-pending"; checkedAt: string }
  | { kind: "resolved" };

/** PAY-008 ถามผลล่าสุดของการจ่ายเงินที่รอผลอยู่ */
export async function checkPaymentStatus(
  db: Db,
  provider: PaymentProvider,
  input: { buyerId: number; groupId: number },
  now: Date = new Date(),
  timeoutMs = PROVIDER_TIMEOUT_MS,
): Promise<CheckResult> {
  const data = readGroup(db, input.groupId, input.buyerId);
  if (!data) return { kind: "not-found" };
  const pending = data.payments.find((p) => p.status === PAYMENT_STATUS.pending && p.omise_charge_id);
  if (!pending?.omise_charge_id) return { kind: "no-pending" };
  const chargeId = pending.omise_charge_id;
  let checked: { answer: Charge; answeredAt: Date };
  try {
    checked = await ask(() => provider.retrieveCharge(chargeId), timeoutMs, now);
  } catch {
    return { kind: "error" };
  }
  return applyCharge(db, pending.id, checked.answer, checked.answeredAt) === PAYMENT_STATUS.pending
    ? { kind: "still-pending", checkedAt: checked.answeredAt.toISOString() }
    : { kind: "resolved" };
}

/** PAY-012 ผู้ซื้อเลิกรอการจ่ายเงินที่รอผลอยู่ เพื่อเลือกวิธีจ่ายใหม่ เวลาหมดเขตจ่ายไม่เปลี่ยน */
export function changePaymentMethod(db: Db, input: { buyerId: number; groupId: number }): boolean {
  if (!readGroup(db, input.groupId, input.buyerId)) return false;
  abandonPendingPayments(db, input.groupId);
  return true;
}

/**
 * หน้าที่เปิดค้างเรียกเป็นระยะ: เลิกรอเมื่อกลุ่มปิดแล้ว (PAY-013) และถามผลของทุกการจ่ายเงินที่ผลยังเปลี่ยนได้
 * เพราะ Omise อาจไม่แจ้งผลกลับมาเอง (PAY-004 PAY-012) ถามไม่สำเร็จไม่เป็นไร รอบหน้าถามใหม่
 */
export async function syncGroupPayments(
  db: Db,
  provider: PaymentProvider,
  input: { buyerId: number; groupId: number },
  now: Date = new Date(),
  timeoutMs = PROVIDER_TIMEOUT_MS,
): Promise<void> {
  const data = readGroup(db, input.groupId, input.buyerId);
  if (!data) return;
  if (stateOf(data, now) === "closed") abandonPendingPayments(db, input.groupId);
  for (const payment of data.payments) {
    const chargeId = payment.omise_charge_id;
    if (!chargeId || (payment.status !== PAYMENT_STATUS.pending && payment.status !== PAYMENT_STATUS.abandoned)) continue;
    try {
      const { answer, answeredAt } = await ask(() => provider.retrieveCharge(chargeId), timeoutMs, now);
      applyCharge(db, payment.id, answer, answeredAt);
    } catch {
      continue;
    }
  }
}

export type NotificationResult = "applied" | "unknown" | "already-used" | "amount-mismatch" | "error";

/**
 * PAY-015 ผลที่ผู้ให้บริการแจ้งเข้ามาเอง เชื่อไม่ได้จนกว่าจะถามกลับแล้วได้ผลเดียวกัน
 * ผลที่ใช้ไปแล้ว อ้างถึงการจ่ายเงินที่ไม่รู้จัก หรือยอดไม่ตรง ไม่เปลี่ยนอะไร
 */
export async function handleChargeNotification(
  db: Db,
  provider: PaymentProvider,
  input: { chargeId: string; amount?: number },
  now: Date = new Date(),
  timeoutMs = PROVIDER_TIMEOUT_MS,
): Promise<NotificationResult> {
  const payment = db.prepare("SELECT id, status, amount FROM payments WHERE omise_charge_id = ?").get(input.chargeId) as
    | { id: number; status: PaymentStatus; amount: number }
    | undefined;
  if (!payment) return "unknown";
  if (FINAL.includes(payment.status)) return "already-used";
  if (input.amount !== undefined && input.amount !== payment.amount) return "amount-mismatch";
  let checked: { answer: Charge; answeredAt: Date };
  try {
    checked = await ask(() => provider.retrieveCharge(input.chargeId), timeoutMs, now);
  } catch {
    return "error";
  }
  applyCharge(db, payment.id, checked.answer, checked.answeredAt);
  return "applied";
}
