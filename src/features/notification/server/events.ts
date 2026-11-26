import type { Db } from "@/shared/db";
import { formatBaht, formatTime } from "@/shared/format";
import { ORDER_STATUS, PARCEL_STATUS, RECEIPT_CONFIRMED_BY, type ParcelStatus, type ReceiptConfirmedBy } from "@/shared/statuses";
import { addNotification, NOTIFICATION_TYPE as TYPE } from "./notifications";

// หนึ่งฟังก์ชันต่อหนึ่งเหตุการณ์ในตารางของ notification.md ส่วนที่ 5
// feature ต้นทางเรียกใน transaction เดียวกับที่บันทึกเหตุการณ์ เหตุการณ์ที่ถูกปฏิเสธจึงไม่มีแจ้งเตือน
// ข้อความถูกเก็บตามตอนที่เหตุการณ์เกิด เรียกซ้ำด้วยเหตุการณ์เดิมไม่ได้รายการเพิ่ม (NTF-016)

/** แจ้งเตือนของร้านขึ้นต้นด้วยคำนี้ (NTF-002) */
const SHOP = "ร้านของฉัน: ";

const DELIVERY_NOTICES: ParcelStatus[] = [
  PARCEL_STATUS.handedOver,
  PARCEL_STATUS.inTransit,
  PARCEL_STATUS.outForDelivery,
  PARCEL_STATUS.delivered,
];

/** NTF-006 NTF-010 การจ่ายเงินเป็น `สำเร็จ`: ผู้ซื้อได้ 1 รายการ และผู้ขายของแต่ละคำสั่งซื้อที่เป็น `จ่ายแล้ว` ได้ร้านละ 1 รายการ */
export function notifyPaymentSucceeded(db: Db, paymentId: number, now: Date = new Date()): void {
  const payment = db
    .prepare("SELECT p.amount, p.group_id, g.buyer_account_id FROM payments p JOIN order_groups g ON g.id = p.group_id WHERE p.id = ?")
    .get(paymentId) as { amount: number; group_id: number; buyer_account_id: number } | undefined;
  if (!payment) return;
  const orders = db
    .prepare(
      `SELECT o.id, o.order_no, o.total, s.owner_account_id FROM payment_orders po
       JOIN orders o ON o.id = po.order_id JOIN shops s ON s.id = o.shop_id WHERE po.payment_id = ? ORDER BY o.id`,
    )
    .all(paymentId) as { id: number; order_no: string; total: number; owner_account_id: number }[];
  addNotification(
    db,
    {
      accountId: payment.buyer_account_id,
      type: TYPE.paymentSucceeded,
      message: `จ่ายเงินสำเร็จ ${formatBaht(payment.amount)} สำหรับ ${orders.length} คำสั่งซื้อ`,
      href: `/pay/${payment.group_id}`,
      eventKey: `payment:${paymentId}:succeeded`,
    },
    now,
  );
  for (const order of orders) {
    addNotification(
      db,
      {
        accountId: order.owner_account_id,
        type: TYPE.shopNewOrder,
        message: `${SHOP}คำสั่งซื้อใหม่ ${order.order_no} ยอด ${formatBaht(order.total)} รอจัดของ`,
        href: `/seller/orders/${order.order_no}`,
        eventKey: `order:${order.id}:paid`,
      },
      now,
    );
  }
}

/** NTF-006 การจ่ายเงินเป็น `ไม่สำเร็จ` */
export function notifyPaymentFailed(db: Db, paymentId: number, now: Date = new Date()): void {
  const payment = db
    .prepare(
      `SELECT p.amount, p.group_id, g.buyer_account_id, g.payment_deadline FROM payments p
       JOIN order_groups g ON g.id = p.group_id WHERE p.id = ?`,
    )
    .get(paymentId) as { amount: number; group_id: number; buyer_account_id: number; payment_deadline: string } | undefined;
  if (!payment) return;
  addNotification(
    db,
    {
      accountId: payment.buyer_account_id,
      type: TYPE.paymentFailed,
      message: `จ่ายเงินไม่สำเร็จ ${formatBaht(payment.amount)} จ่ายใหม่ได้ถึง ${formatTime(payment.payment_deadline)}`,
      href: `/pay/${payment.group_id}`,
      eventKey: `payment:${paymentId}:failed`,
    },
    now,
  );
}

/** NTF-006 กลุ่มคำสั่งซื้อถูกยกเลิกเพราะหมดเวลาจ่ายเงิน 1 รายการต่อกลุ่ม orderCount คือจำนวนคำสั่งซื้อที่ถูกยกเลิก */
export function notifyPaymentTimedOut(db: Db, groupId: number, orderCount: number, now: Date = new Date()): void {
  const group = db.prepare("SELECT buyer_account_id FROM order_groups WHERE id = ?").get(groupId);
  if (!group) return;
  addNotification(
    db,
    {
      accountId: Number(group.buyer_account_id),
      type: TYPE.paymentTimedOut,
      message: `หมดเวลาจ่ายเงิน คำสั่งซื้อ ${orderCount} รายการถูกยกเลิก`,
      href: `/orders?status=${encodeURIComponent(ORDER_STATUS.cancelled)}`,
      eventKey: `group:${groupId}:payment-timeout`,
    },
    now,
  );
}

/**
 * NTF-007 NTF-008 พัสดุเปลี่ยนสถานะการจัดส่ง
 * `ส่งไม่สำเร็จ` ได้แจ้งเตือนคำสั่งซื้อถูกยกเลิกรายการเดียว `รอร้านจัดของ` ไม่มีแจ้งเตือน
 */
export function notifyParcelStatusChanged(db: Db, trackingNo: string, status: ParcelStatus, now: Date = new Date()): void {
  const parcel = db
    .prepare(
      `SELECT p.id, o.id AS order_id, o.order_no, o.buyer_account_id, s.name AS shop_name
       FROM parcels p JOIN orders o ON o.id = p.order_id JOIN shops s ON s.id = o.shop_id WHERE p.tracking_no = ?`,
    )
    .get(trackingNo) as { id: number; order_id: number; order_no: string; buyer_account_id: number; shop_name: string } | undefined;
  if (!parcel) return;
  if (status === PARCEL_STATUS.failed) {
    addNotification(
      db,
      {
        accountId: parcel.buyer_account_id,
        type: TYPE.orderCancelled,
        message: `คำสั่งซื้อ ${parcel.order_no} จากร้าน ${parcel.shop_name} ถูกยกเลิก เพราะ${PARCEL_STATUS.failed}`,
        href: `/orders/${parcel.order_no}`,
        eventKey: `order:${parcel.order_id}:cancelled`,
      },
      now,
    );
    return;
  }
  if (!DELIVERY_NOTICES.includes(status)) return;
  const hint = status === PARCEL_STATUS.delivered ? " กดได้รับสินค้าแล้วเมื่อได้ของ" : "";
  addNotification(
    db,
    {
      accountId: parcel.buyer_account_id,
      type: TYPE.parcelStatus,
      message: `พัสดุ ${trackingNo} จากร้าน ${parcel.shop_name} เป็น ${status}${hint}`,
      href: `/track/${trackingNo}`,
      eventKey: `parcel:${parcel.id}:${status}`,
    },
    now,
  );
}

/** NTF-011 คำสั่งซื้อของร้านเป็น `สำเร็จ` เพราะผู้ซื้อยืนยันเอง หรือระบบยืนยันให้เมื่อครบ 7 วัน */
export function notifyOrderCompleted(db: Db, orderId: number, by: ReceiptConfirmedBy, now: Date = new Date()): void {
  const order = db
    .prepare("SELECT o.order_no, s.owner_account_id FROM orders o JOIN shops s ON s.id = o.shop_id WHERE o.id = ?")
    .get(orderId) as { order_no: string; owner_account_id: number } | undefined;
  if (!order) return;
  addNotification(
    db,
    {
      accountId: order.owner_account_id,
      type: TYPE.shopOrderCompleted,
      message:
        by === RECEIPT_CONFIRMED_BY.buyer
          ? `${SHOP}ผู้ซื้อยืนยันรับสินค้าของคำสั่งซื้อ ${order.order_no} แล้ว`
          : `${SHOP}คำสั่งซื้อ ${order.order_no} สำเร็จ ระบบยืนยันรับสินค้าให้เพราะครบ 7 วัน`,
      href: `/seller/orders/${order.order_no}`,
      eventKey: `order:${orderId}:completed`,
    },
    now,
  );
}

/** NTF-013 สต็อกของแบบย่อยเหลือ 0 เพราะคำสั่งซื้อ orderId แบบย่อยที่ได้สต็อกคืนแล้วเหลือ 0 อีกครั้งจากคำสั่งซื้ออื่นได้รายการใหม่ */
export function notifyStockEmpty(db: Db, variantId: number, orderId: number, now: Date = new Date()): void {
  const variant = db
    .prepare(
      `SELECT trim(p.name || ' ' || coalesce(ov1.value, '') || ' ' || coalesce(ov2.value, '')) AS label, s.owner_account_id
       FROM variants v JOIN products p ON p.id = v.product_id JOIN shops s ON s.id = p.shop_id
       LEFT JOIN product_option_values ov1 ON ov1.id = v.option_value1_id
       LEFT JOIN product_option_values ov2 ON ov2.id = v.option_value2_id
       WHERE v.id = ?`,
    )
    .get(variantId) as { label: string; owner_account_id: number } | undefined;
  if (!variant) return;
  addNotification(
    db,
    {
      accountId: variant.owner_account_id,
      type: TYPE.shopStockEmpty,
      message: `${SHOP}${variant.label} สต็อกเหลือ 0 ชิ้น`,
      href: "/seller/stock?filter=out",
      eventKey: `variant:${variantId}:empty:${orderId}`,
    },
    now,
  );
}

// เหตุการณ์ของรีวิว (review.md) โค้ดรีวิวเรียกใน transaction เดียวกับที่บันทึก และส่งข้อมูลที่มีอยู่แล้วเข้ามา

/** NTF-009 ร้านส่งคำตอบของร้านครั้งแรกให้รีวิว (REV-015) href คือหน้าเขียนรีวิวของรายการในคำสั่งซื้อนั้น */
export function notifyReviewReplied(
  db: Db,
  input: { reviewId: number; buyerAccountId: number; shopName: string; productName: string; href: string },
  now: Date = new Date(),
): void {
  addNotification(
    db,
    {
      accountId: input.buyerAccountId,
      type: TYPE.reviewReplied,
      message: `ร้าน ${input.shopName} ตอบรีวิว ${input.productName} ของคุณ`,
      href: input.href,
      eventKey: `review:${input.reviewId}:replied`,
    },
    now,
  );
}

/** NTF-009 ผู้ดูแลแพลตฟอร์มซ่อนรีวิว (REV-016) href คือหน้าเขียนรีวิวของรายการในคำสั่งซื้อนั้น */
export function notifyReviewHidden(
  db: Db,
  input: { reviewId: number; buyerAccountId: number; productName: string; reason: string; href: string },
  now: Date = new Date(),
): void {
  addNotification(
    db,
    {
      accountId: input.buyerAccountId,
      type: TYPE.reviewHidden,
      message: `รีวิว ${input.productName} ของคุณถูกซ่อนโดยผู้ดูแลแพลตฟอร์ม เหตุผล: ${input.reason}`,
      href: input.href,
      eventKey: `review:${input.reviewId}:hidden`,
    },
    now,
  );
}

/** NTF-012 ผู้ซื้อส่งรีวิวของสินค้าในร้านครั้งแรก (REV-001) href คือหน้ารีวิวของร้านที่แสดงรีวิวนั้นเป็นรายการแรก */
export function notifyNewReview(
  db: Db,
  input: { reviewId: number; shopId: number; productName: string; rating: number; href: string },
  now: Date = new Date(),
): void {
  const shop = db.prepare("SELECT owner_account_id FROM shops WHERE id = ?").get(input.shopId);
  if (!shop) return;
  addNotification(
    db,
    {
      accountId: Number(shop.owner_account_id),
      type: TYPE.shopNewReview,
      message: `${SHOP}รีวิวใหม่ ${input.rating} ดาว ของ ${input.productName}`,
      href: input.href,
      eventKey: `review:${input.reviewId}:new`,
    },
    now,
  );
}
