import type { Db } from "@/shared/db";
import { ORDER_STATUS, PAYMENT_STATUS, type OrderStatus, type ParcelStatus, type PaymentMethod } from "@/shared/statuses";

// ORD อ่านอย่างเดียว ไฟล์นี้ไม่มีฟังก์ชันที่เขียนฐานข้อมูล (ORD-015)

export const PAGE_SIZE = 20;

export type StatusCounts = { all: number } & Record<OrderStatus, number>;

/** จำนวนคำสั่งซื้อของร้านแยกตามสถานะ นับจากข้อมูลล่าสุดเสมอ */
export function countShopOrders(db: Db, shopId: number): StatusCounts {
  const counts = { all: 0 } as StatusCounts;
  for (const status of Object.values(ORDER_STATUS)) counts[status] = 0;
  const rows = db.prepare("SELECT status, COUNT(*) AS n FROM orders WHERE shop_id = ? GROUP BY status").all(shopId) as {
    status: OrderStatus;
    n: number;
  }[];
  for (const row of rows) {
    counts[row.status] = row.n;
    counts.all += row.n;
  }
  return counts;
}

export type ListQuery = {
  status: OrderStatus | null;
  /** เลขคำสั่งซื้อทั้งเลขหรือบางส่วน ถ้ามีจะค้นทุกสถานะโดยไม่สนตัวกรอง ส่ง "" เมื่อไม่ค้น */
  q: string;
  page: number;
  /** คำสั่งซื้อที่เลขแถวมากกว่านี้ถือเป็นคำสั่งซื้อใหม่ ไม่แทรกในรายการ null = ใช้คำสั่งซื้อล่าสุดตอนนี้ */
  asOf: number | null;
};

export type OrderRow = {
  orderNo: string;
  orderedAt: string;
  recipientName: string;
  itemCount: number;
  total: number;
  status: OrderStatus;
  trackingNo: string | null;
};

export type OrderList = {
  items: OrderRow[];
  total: number;
  page: number;
  totalPages: number;
  asOf: number;
  /** คำสั่งซื้อที่ตรงกับตัวกรองเดียวกันแต่เข้ามาหลัง asOf (ORD-010) */
  newCount: number;
};

/** รายการคำสั่งซื้อของร้าน ใหม่ไปเก่า หน้าละ 20 รายการ (ORD-001 ถึง ORD-003) */
export function listShopOrders(db: Db, shopId: number, query: ListQuery): OrderList {
  const where = ["o.shop_id = ?"];
  const args: (string | number)[] = [shopId];
  if (query.q) {
    where.push("instr(lower(o.order_no), lower(?)) > 0");
    args.push(query.q);
  } else if (query.status) {
    where.push("o.status = ?");
    args.push(query.status);
  }
  const filter = where.join(" AND ");

  const asOf =
    query.asOf ?? (db.prepare("SELECT COALESCE(MAX(id), 0) AS id FROM orders WHERE shop_id = ?").get(shopId) as { id: number }).id;
  const count = (newer: boolean) =>
    (db.prepare(`SELECT COUNT(*) AS n FROM orders o WHERE ${filter} AND o.id ${newer ? ">" : "<="} ?`).get(...args, asOf) as { n: number })
      .n;

  const total = count(false);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, query.page), totalPages);
  const items = db
    .prepare(
      `SELECT o.order_no AS orderNo, o.ordered_at AS orderedAt, o.ship_recipient_name AS recipientName,
              (SELECT SUM(quantity) FROM order_items WHERE order_id = o.id) AS itemCount,
              o.total, o.status, p.tracking_no AS trackingNo
       FROM orders o
       LEFT JOIN parcels p ON p.order_id = o.id
       WHERE ${filter} AND o.id <= ?
       ORDER BY o.ordered_at DESC, o.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...args, asOf, PAGE_SIZE, (page - 1) * PAGE_SIZE) as OrderRow[];

  return { items, total, page, totalPages, asOf, newCount: count(true) };
}

export type OrderDetail = {
  id: number;
  orderNo: string;
  orderedAt: string;
  status: OrderStatus;
  itemsTotal: number;
  shippingFee: number;
  total: number;
  items: { productName: string; variantLabel: string; unitPrice: number; quantity: number; coverImageUrl: string | null }[];
  recipient: { name: string; phone: string; address: string };
  payment: { method: PaymentMethod; paidAt: string } | null;
};

/** คำสั่งซื้อของร้านนี้ หรือ null ทั้งตอนไม่มีเลขนี้และตอนเป็นของร้านอื่น (ORD-012) */
export function getShopOrder(db: Db, shopId: number, orderNo: string): OrderDetail | null {
  const order = db
    .prepare(
      `SELECT id, order_no AS orderNo, ordered_at AS orderedAt, status, items_total AS itemsTotal,
              shipping_fee AS shippingFee, total, ship_recipient_name AS name, ship_phone AS phone,
              ship_address || ' ' || ship_subdistrict || ' ' || ship_district || ' ' || ship_province || ' ' || ship_postcode AS address
       FROM orders WHERE order_no = ? AND shop_id = ?`,
    )
    .get(orderNo, shopId) as (Omit<OrderDetail, "items" | "recipient" | "payment"> & OrderDetail["recipient"]) | undefined;
  if (!order) return null;

  const items = db
    .prepare(
      `SELECT product_name AS productName, variant_label AS variantLabel, unit_price AS unitPrice, quantity,
              cover_image_url AS coverImageUrl
       FROM order_items WHERE order_id = ? ORDER BY id`,
    )
    .all(order.id) as OrderDetail["items"];
  const payment = db
    .prepare(
      `SELECT p.method, COALESCE(p.resolved_at, p.started_at) AS paidAt
       FROM payments p JOIN payment_orders po ON po.payment_id = p.id
       WHERE po.order_id = ? AND p.status = ?`,
    )
    .get(order.id, PAYMENT_STATUS.succeeded) as OrderDetail["payment"] | undefined;

  const { name, phone, address, ...rest } = order;
  return { ...rest, items, recipient: { name, phone, address }, payment: payment ? { ...payment } : null };
}

export type ParcelSummary = { trackingNo: string; status: ParcelStatus; changedAt: string };

/** พัสดุของคำสั่งซื้อ พร้อมเวลาที่เปลี่ยนเป็นสถานะล่าสุด หรือ null ถ้ายังไม่มีพัสดุ (ORD-008) */
export function findOrderParcel(db: Db, orderId: number): ParcelSummary | null {
  const parcel = db
    .prepare(
      `SELECT p.tracking_no AS trackingNo, p.status,
              COALESCE((SELECT MAX(created_at) FROM parcel_history WHERE parcel_id = p.id AND status = p.status), p.updated_at) AS changedAt
       FROM parcels p WHERE p.order_id = ?`,
    )
    .get(orderId) as ParcelSummary | undefined;
  return parcel ? { ...parcel } : null;
}

/** พัสดุที่ปุ่ม "จัดส่ง" พาไป ตรวจสถานะตอนกดเพราะหน้าอาจค้างอยู่หลังคำสั่งซื้อถูกยกเลิก (ORD-009) */
export function shippingTarget(
  db: Db,
  shopId: number,
  orderNo: string,
): { ok: true; trackingNo: string } | { ok: false; error: string } {
  const order = db
    .prepare(
      `SELECT o.status, p.tracking_no AS trackingNo
       FROM orders o LEFT JOIN parcels p ON p.order_id = o.id
       WHERE o.order_no = ? AND o.shop_id = ?`,
    )
    .get(orderNo, shopId) as { status: OrderStatus; trackingNo: string | null } | undefined;
  if (!order) return { ok: false, error: "ไม่พบคำสั่งซื้อ" };
  if (order.status === ORDER_STATUS.cancelled) return { ok: false, error: "คำสั่งซื้อนี้ถูกยกเลิกแล้ว จัดส่งไม่ได้" };
  if (!order.trackingNo) return { ok: false, error: "ยังไม่มีพัสดุ จะมีเมื่อผู้ซื้อจ่ายเงินแล้ว" };
  return { ok: true, trackingNo: order.trackingNo };
}

/**
 * ค่าที่เปลี่ยนเมื่อร้านมีคำสั่งซื้อใหม่ คำสั่งซื้อเปลี่ยนสถานะ หรือพัสดุเปลี่ยนสถานะ
 * หน้าที่เปิดค้างเทียบค่านี้เพื่อรู้ว่าต้องโหลดใหม่ไหม (ORD-010 ORD-011)
 */
export function shopOrdersVersion(db: Db, shopId: number): string {
  // สถานะคำสั่งซื้อเดินหน้าทางเดียว การเปลี่ยนใดๆ จึงทำให้จำนวนของบางสถานะเปลี่ยนเสมอ
  const latest = db
    .prepare(
      `SELECT (SELECT MAX(id) FROM orders WHERE shop_id = ?) AS lastOrder,
              (SELECT MAX(h.id) || '/' || MAX(p.updated_at)
               FROM parcels p JOIN orders o ON o.id = p.order_id
               LEFT JOIN parcel_history h ON h.parcel_id = p.id
               WHERE o.shop_id = ?) AS lastParcelChange`,
    )
    .get(shopId, shopId) as { lastOrder: number | null; lastParcelChange: string | null };
  return JSON.stringify([countShopOrders(db, shopId), latest.lastOrder, latest.lastParcelChange]);
}
