import { CANCEL_REASON, cancelAwaitingPaymentGroup, expireOverdueOrderGroups } from "@/features/checkout/server/order-groups";
import { transaction, type Db } from "@/shared/db";
import { PAGE_SIZE } from "@/shared/paging";
import { ORDER_STATUS, PAYMENT_STATUS, type OrderStatus } from "@/shared/statuses";

// คำสั่งซื้อของผู้ซื้อ: หน้ารายการ (CHK-009) หน้ารายละเอียด (CHK-010) และการยกเลิกตอนรอจ่ายเงิน (CHK-011)

export const BUYER_CANCEL_REASON = CANCEL_REASON.buyer;

const ORDER_STATUSES = Object.values(ORDER_STATUS) as string[];

/** ตัวกรองตัวที่ 7 ของหน้ารายการคำสั่งซื้อ: คำสั่งซื้อที่ `สำเร็จ` และยังมีรายการที่ไม่มีรีวิว (REV-005) */
export const AWAITING_REVIEW = "รอรีวิว";

export type OrderFilter = OrderStatus | typeof AWAITING_REVIEW;

/** ค่าตัวกรองจากที่อยู่หน้าเว็บ ค่าที่ไม่ใช่คำสถานะของคำสั่งซื้อหรือ "รอรีวิว" ถือเป็นทั้งหมด */
export function parseOrderStatus(value: unknown): OrderFilter | null {
  return typeof value === "string" && (ORDER_STATUSES.includes(value) || value === AWAITING_REVIEW) ? (value as OrderFilter) : null;
}

const UNREVIEWED_ITEMS = `(SELECT count(*) FROM order_items i WHERE i.order_id = o.id
  AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.order_item_id = i.id))`;

/** จำนวนคำสั่งซื้อของผู้ซื้อที่ยังมีรายการรอรีวิว ตัวเลขข้างตัวกรอง "รอรีวิว" (REV-005) */
export function countOrdersAwaitingReview(db: Db, buyerAccountId: number): number {
  return Number(
    db
      .prepare(`SELECT count(*) AS n FROM orders o WHERE o.buyer_account_id = ? AND o.status = ? AND ${UNREVIEWED_ITEMS} > 0`)
      .get(buyerAccountId, ORDER_STATUS.completed)?.n,
  );
}

/** ตำแหน่งของรายการสุดท้ายที่โหลดแล้ว ใช้โหลดหน้าถัดไปโดยไม่ซ้ำแม้มีคำสั่งซื้อใหม่เข้ามาระหว่างนั้น */
export type OrderCursor = { orderedAt: string; id: number };

export type BuyerOrderSummary = {
  id: number;
  orderNo: string;
  groupId: number;
  shopName: string;
  status: OrderStatus;
  total: number;
  orderedAt: string;
  paymentDeadline: string;
  firstItemName: string;
  /** รูปปกของสินค้าชิ้นแรกตามตอนที่สั่ง */
  firstItemCover: string | null;
  /** จำนวนชิ้นรวมทุกรายการ */
  itemCount: number;
  trackingNo: string | null;
  /** ยังกด "จ่ายเงิน" และ "ยกเลิกคำสั่งซื้อ" ได้ */
  payable: boolean;
  /** จำนวนรายการในคำสั่งซื้อที่รอรีวิว เป็น 0 ถ้าคำสั่งซื้อยังไม่ `สำเร็จ` (REV-005) */
  awaitingReview: number;
};

export type BuyerOrderPage = { orders: BuyerOrderSummary[]; next: OrderCursor | null };

const isPayable = (status: string, paymentDeadline: string, now: Date) =>
  status === ORDER_STATUS.awaitingPayment && now < new Date(paymentDeadline);

type SummaryRow = {
  id: number;
  order_no: string;
  group_id: number;
  shop_name: string;
  status: OrderStatus;
  total: number;
  ordered_at: string;
  payment_deadline: string;
  first_item_name: string;
  first_item_cover: string | null;
  item_count: number;
  tracking_no: string | null;
  unreviewed: number;
};

export function listBuyerOrders(
  db: Db,
  buyerAccountId: number,
  options: { status?: OrderFilter | null; after?: OrderCursor | null } = {},
  now: Date = new Date(),
): BuyerOrderPage {
  // ไม่รอรอบตรวจ 15 วินาที คำสั่งซื้อที่เลยเขตจ่ายจึงขึ้น `ยกเลิก` ทันทีที่เปิดหน้า (CHK-008)
  expireOverdueOrderGroups(db, now);
  const awaitingReview = options.status === AWAITING_REVIEW;
  const status = awaitingReview ? ORDER_STATUS.completed : (options.status ?? null);
  const after = options.after ?? null;
  const rows = db
    .prepare(
      `SELECT o.id, o.order_no, o.group_id, s.name AS shop_name, o.status, o.total, o.ordered_at, g.payment_deadline,
              (SELECT product_name FROM order_items WHERE order_id = o.id ORDER BY id LIMIT 1) AS first_item_name,
              (SELECT cover_image_url FROM order_items WHERE order_id = o.id ORDER BY id LIMIT 1) AS first_item_cover,
              (SELECT sum(quantity) FROM order_items WHERE order_id = o.id) AS item_count,
              (SELECT tracking_no FROM parcels WHERE order_id = o.id) AS tracking_no,
              ${UNREVIEWED_ITEMS} AS unreviewed
       FROM orders o
       JOIN shops s ON s.id = o.shop_id
       JOIN order_groups g ON g.id = o.group_id
       WHERE o.buyer_account_id = ?
         AND (? IS NULL OR o.status = ?)
         AND (? = 0 OR ${UNREVIEWED_ITEMS} > 0)
         AND (? IS NULL OR (o.ordered_at, o.id) < (?, ?))
       ORDER BY o.ordered_at DESC, o.id DESC
       LIMIT ?`,
    )
    .all(
      buyerAccountId,
      status,
      status,
      awaitingReview ? 1 : 0,
      after?.orderedAt ?? null,
      after?.orderedAt ?? null,
      after?.id ?? null,
      PAGE_SIZE + 1,
    ) as SummaryRow[];

  const orders = rows.slice(0, PAGE_SIZE).map((row) => ({
    id: row.id,
    orderNo: row.order_no,
    groupId: row.group_id,
    shopName: row.shop_name,
    status: row.status,
    total: row.total,
    orderedAt: row.ordered_at,
    paymentDeadline: row.payment_deadline,
    firstItemName: row.first_item_name,
    firstItemCover: row.first_item_cover,
    itemCount: row.item_count,
    trackingNo: row.tracking_no,
    payable: isPayable(row.status, row.payment_deadline, now),
    awaitingReview: row.status === ORDER_STATUS.completed ? row.unreviewed : 0,
  }));
  const last = orders.at(-1);
  return { orders, next: rows.length > PAGE_SIZE && last ? { orderedAt: last.orderedAt, id: last.id } : null };
}

export type BuyerOrderDetail = {
  id: number;
  orderNo: string;
  groupId: number;
  shopName: string;
  status: OrderStatus;
  orderedAt: string;
  paymentDeadline: string;
  payable: boolean;
  itemsTotal: number;
  shippingFee: number;
  total: number;
  cancelledAt: string | null;
  cancelReason: string | null;
  shipTo: {
    recipientName: string;
    phone: string;
    address: string;
    subdistrict: string;
    district: string;
    province: string;
    postcode: string;
  };
  items: {
    id: number;
    productName: string;
    variantLabel: string;
    unitPrice: number;
    quantity: number;
    coverImageUrl: string | null;
    /** คะแนนที่ผู้ซื้อให้รายการนี้ null ถ้ายังไม่มีรีวิว (REV-005) */
    reviewRating: number | null;
  }[];
  trackingNo: string | null;
  /** ทุกคำสั่งซื้อในกลุ่มคำสั่งซื้อเดียวกัน รวมรายการนี้ */
  group: { orderNo: string; shopName: string }[];
};

/** คำสั่งซื้อของผู้ซื้อคนนี้ หรือ null ถ้าไม่มีหรือเป็นของบัญชีอื่น */
export function getBuyerOrder(db: Db, buyerAccountId: number, orderNo: string, now: Date = new Date()): BuyerOrderDetail | null {
  expireOverdueOrderGroups(db, now);
  const row = db
    .prepare(
      `SELECT o.*, s.name AS shop_name, g.payment_deadline,
              (SELECT tracking_no FROM parcels WHERE order_id = o.id) AS tracking_no
       FROM orders o
       JOIN shops s ON s.id = o.shop_id
       JOIN order_groups g ON g.id = o.group_id
       WHERE o.order_no = ? AND o.buyer_account_id = ?`,
    )
    .get(orderNo, buyerAccountId) as Record<string, string | number | null> | undefined;
  if (!row) return null;

  const id = row.id as number;
  const items = db
    .prepare(
      `SELECT i.id, i.product_name, i.variant_label, i.unit_price, i.quantity, i.cover_image_url, r.rating AS review_rating
       FROM order_items i LEFT JOIN reviews r ON r.order_item_id = i.id WHERE i.order_id = ? ORDER BY i.id`,
    )
    .all(id) as {
    id: number;
    product_name: string;
    variant_label: string;
    unit_price: number;
    quantity: number;
    cover_image_url: string | null;
    review_rating: number | null;
  }[];
  const group = db
    .prepare(
      `SELECT o.order_no, s.name AS shop_name FROM orders o JOIN shops s ON s.id = o.shop_id
       WHERE o.group_id = ? ORDER BY o.id`,
    )
    .all(row.group_id as number) as { order_no: string; shop_name: string }[];

  const status = row.status as OrderStatus;
  const paymentDeadline = row.payment_deadline as string;
  return {
    id,
    orderNo: row.order_no as string,
    groupId: row.group_id as number,
    shopName: row.shop_name as string,
    status,
    orderedAt: row.ordered_at as string,
    paymentDeadline,
    payable: isPayable(status, paymentDeadline, now),
    itemsTotal: row.items_total as number,
    shippingFee: row.shipping_fee as number,
    total: row.total as number,
    cancelledAt: row.cancelled_at as string | null,
    cancelReason: row.cancel_reason as string | null,
    shipTo: {
      recipientName: row.ship_recipient_name as string,
      phone: row.ship_phone as string,
      address: row.ship_address as string,
      subdistrict: row.ship_subdistrict as string,
      district: row.ship_district as string,
      province: row.ship_province as string,
      postcode: row.ship_postcode as string,
    },
    items: items.map((item) => ({
      id: item.id,
      productName: item.product_name,
      variantLabel: item.variant_label,
      unitPrice: item.unit_price,
      quantity: item.quantity,
      coverImageUrl: item.cover_image_url,
      reviewRating: item.review_rating,
    })),
    trackingNo: row.tracking_no as string | null,
    group: group.map((order) => ({ orderNo: order.order_no, shopName: order.shop_name })),
  };
}

export type CancelRefusal = "notFound" | "alreadyCancelled" | "alreadyPaid" | "expired" | "paymentPending";

export const CANCEL_REFUSED: Record<CancelRefusal, string> = {
  notFound: "ไม่พบคำสั่งซื้อ",
  alreadyCancelled: "คำสั่งซื้อนี้ถูกยกเลิกไปแล้ว",
  alreadyPaid: "คำสั่งซื้อนี้จ่ายเงินแล้ว ยกเลิกจากหน้านี้ไม่ได้",
  expired: "คำสั่งซื้อนี้หมดเวลาจ่ายเงินแล้ว",
  paymentPending: "มีการจ่ายเงินที่กำลังรอผลอยู่ กดเปลี่ยนวิธีจ่ายก่อนจึงยกเลิกได้",
};

/** ยกเลิกทุกคำสั่งซื้อในกลุ่มคำสั่งซื้อเดียวกับ orderNo ตอนรอจ่ายเงิน แล้วคืนสต็อกทีละคำสั่งซื้อ (INV-013) */
export function cancelOrderGroup(
  db: Db,
  input: { buyerAccountId: number; orderNo: string },
  now: Date = new Date(),
): { ok: true } | { ok: false; reason: CancelRefusal } {
  return transaction(db, () => {
    const order = db
      .prepare(
        `SELECT o.group_id, o.status, g.payment_deadline FROM orders o JOIN order_groups g ON g.id = o.group_id
         WHERE o.order_no = ? AND o.buyer_account_id = ?`,
      )
      .get(input.orderNo, input.buyerAccountId) as { group_id: number; status: OrderStatus; payment_deadline: string } | undefined;
    if (!order) return { ok: false, reason: "notFound" } as const;
    if (order.status === ORDER_STATUS.cancelled) return { ok: false, reason: "alreadyCancelled" } as const;
    if (order.status !== ORDER_STATUS.awaitingPayment) return { ok: false, reason: "alreadyPaid" } as const;
    // ครบเวลาแล้วเป็นการหมดเวลาจ่ายเงิน เหตุผลจึงต้องเป็น "หมดเวลาจ่ายเงิน" ไม่ใช่ผู้ซื้อยกเลิก
    if (!isPayable(order.status, order.payment_deadline, now)) {
      cancelAwaitingPaymentGroup(db, order.group_id, CANCEL_REASON.paymentTimeout, now);
      return { ok: false, reason: "expired" } as const;
    }
    const pending = db
      .prepare("SELECT 1 FROM payments WHERE group_id = ? AND status = ?")
      .get(order.group_id, PAYMENT_STATUS.pending);
    if (pending) return { ok: false, reason: "paymentPending" } as const;

    cancelAwaitingPaymentGroup(db, order.group_id, BUYER_CANCEL_REASON, now);
    return { ok: true } as const;
  });
}
