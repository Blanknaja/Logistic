import { transaction, type Db } from "@/shared/db";
import { ORDER_STATUS, PAYMENT_STATUS, type OrderStatus } from "@/shared/statuses";

// คำสั่งซื้อของผู้ซื้อ: หน้ารายการ (CHK-009) หน้ารายละเอียด (CHK-010) และการยกเลิกตอนรอจ่ายเงิน (CHK-011)

export const ORDERS_PAGE_SIZE = 20;

export const BUYER_CANCEL_REASON = "ผู้ซื้อยกเลิก";

const ORDER_STATUSES = Object.values(ORDER_STATUS) as string[];

/** ค่าตัวกรองจากที่อยู่หน้าเว็บ ค่าที่ไม่ใช่คำสถานะของคำสั่งซื้อถือเป็นทั้งหมด */
export function parseOrderStatus(value: unknown): OrderStatus | null {
  return typeof value === "string" && ORDER_STATUSES.includes(value) ? (value as OrderStatus) : null;
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
  /** จำนวนชิ้นรวมทุกรายการ */
  itemCount: number;
  /** ยังกด "จ่ายเงิน" และ "ยกเลิกคำสั่งซื้อ" ได้ */
  payable: boolean;
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
  item_count: number;
};

export function listBuyerOrders(
  db: Db,
  buyerAccountId: number,
  options: { status?: OrderStatus | null; after?: OrderCursor | null } = {},
  now: Date = new Date(),
): BuyerOrderPage {
  const status = options.status ?? null;
  const after = options.after ?? null;
  const rows = db
    .prepare(
      `SELECT o.id, o.order_no, o.group_id, s.name AS shop_name, o.status, o.total, o.ordered_at, g.payment_deadline,
              (SELECT product_name FROM order_items WHERE order_id = o.id ORDER BY id LIMIT 1) AS first_item_name,
              (SELECT sum(quantity) FROM order_items WHERE order_id = o.id) AS item_count
       FROM orders o
       JOIN shops s ON s.id = o.shop_id
       JOIN order_groups g ON g.id = o.group_id
       WHERE o.buyer_account_id = ?
         AND (? IS NULL OR o.status = ?)
         AND (? IS NULL OR (o.ordered_at, o.id) < (?, ?))
       ORDER BY o.ordered_at DESC, o.id DESC
       LIMIT ?`,
    )
    .all(
      buyerAccountId,
      status,
      status,
      after?.orderedAt ?? null,
      after?.orderedAt ?? null,
      after?.id ?? null,
      ORDERS_PAGE_SIZE + 1,
    ) as SummaryRow[];

  const orders = rows.slice(0, ORDERS_PAGE_SIZE).map((row) => ({
    id: row.id,
    orderNo: row.order_no,
    groupId: row.group_id,
    shopName: row.shop_name,
    status: row.status,
    total: row.total,
    orderedAt: row.ordered_at,
    paymentDeadline: row.payment_deadline,
    firstItemName: row.first_item_name,
    itemCount: row.item_count,
    payable: isPayable(row.status, row.payment_deadline, now),
  }));
  const last = orders.at(-1);
  return { orders, next: rows.length > ORDERS_PAGE_SIZE && last ? { orderedAt: last.orderedAt, id: last.id } : null };
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
  }[];
  trackingNo: string | null;
  /** ทุกคำสั่งซื้อในกลุ่มคำสั่งซื้อเดียวกัน รวมรายการนี้ */
  group: { orderNo: string; shopName: string }[];
};

/** คำสั่งซื้อของผู้ซื้อคนนี้ หรือ null ถ้าไม่มีหรือเป็นของบัญชีอื่น */
export function getBuyerOrder(db: Db, buyerAccountId: number, orderNo: string, now: Date = new Date()): BuyerOrderDetail | null {
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
      `SELECT id, product_name, variant_label, unit_price, quantity, cover_image_url
       FROM order_items WHERE order_id = ? ORDER BY id`,
    )
    .all(id) as { id: number; product_name: string; variant_label: string; unit_price: number; quantity: number; cover_image_url: string | null }[];
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
    })),
    trackingNo: row.tracking_no as string | null,
    group: group.map((order) => ({ orderNo: order.order_no, shopName: order.shop_name })),
  };
}

/** คืนสต็อกที่จองไว้ของคำสั่งซื้อที่เพิ่งเป็น `ยกเลิก` (INV-013) ทำงานใน transaction เดียวกับการยกเลิก */
export type ReleaseStock = (db: Db, orderId: number, now: Date) => void;

export type CancelRefusal = "notFound" | "alreadyCancelled" | "alreadyPaid" | "expired" | "paymentPending";

export const CANCEL_REFUSED: Record<CancelRefusal, string> = {
  notFound: "ไม่พบคำสั่งซื้อ",
  alreadyCancelled: "คำสั่งซื้อนี้ถูกยกเลิกไปแล้ว",
  alreadyPaid: "คำสั่งซื้อนี้จ่ายเงินแล้ว ยกเลิกจากหน้านี้ไม่ได้",
  expired: "คำสั่งซื้อนี้หมดเวลาจ่ายเงินแล้ว",
  paymentPending: "มีการจ่ายเงินที่กำลังรอผลอยู่ กดเปลี่ยนวิธีจ่ายก่อนจึงยกเลิกได้",
};

/** ยกเลิกทุกคำสั่งซื้อในกลุ่มคำสั่งซื้อเดียวกับ orderNo ตอนรอจ่ายเงิน แล้วคืนสต็อกทีละคำสั่งซื้อ */
export function cancelOrderGroup(
  db: Db,
  input: { buyerAccountId: number; orderNo: string; releaseStock: ReleaseStock },
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
    // ครบเวลาแล้วเป็นงานของการหมดเวลาจ่ายเงิน เหตุผลจึงต้องเป็น "หมดเวลาจ่ายเงิน" และคืนสต็อกครั้งเดียว
    if (!isPayable(order.status, order.payment_deadline, now)) return { ok: false, reason: "expired" } as const;
    const pending = db
      .prepare("SELECT 1 FROM payments WHERE group_id = ? AND status = ?")
      .get(order.group_id, PAYMENT_STATUS.pending);
    if (pending) return { ok: false, reason: "paymentPending" } as const;

    const cancelled = db
      .prepare(
        `UPDATE orders SET status = ?, cancelled_at = ?, cancel_reason = ?
         WHERE group_id = ? AND status = ? RETURNING id`,
      )
      .all(ORDER_STATUS.cancelled, now.toISOString(), BUYER_CANCEL_REASON, order.group_id, ORDER_STATUS.awaitingPayment) as {
      id: number;
    }[];
    for (const { id } of cancelled) input.releaseStock(db, id, now);
    return { ok: true } as const;
  });
}
