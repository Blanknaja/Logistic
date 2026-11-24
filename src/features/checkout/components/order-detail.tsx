import Link from "next/link";
import { CANCEL_REFUSED, type BuyerOrderDetail, type CancelRefusal } from "@/features/checkout/server/buyer-orders";
import { formatBaht, formatDateTime, formatNumber } from "@/shared/format";
import { ORDER_STATUS } from "@/shared/statuses";
import { CancelOrderForm } from "./cancel-order-form";
import styles from "./buyer-orders.module.css";

/** "จะยกเลิก 2 คำสั่งซื้อที่จ่ายรวมกัน: ผ้าดี และ บ้านแก้ว" */
export function cancelConfirmMessage(group: { shopName: string }[]): string {
  const names = group.map((order) => order.shopName);
  if (names.length === 1) return `จะยกเลิก 1 คำสั่งซื้อ: ${names[0]}`;
  return `จะยกเลิก ${names.length} คำสั่งซื้อที่จ่ายรวมกัน: ${names.slice(0, -1).join(", ")} และ ${names.at(-1)}`;
}

/** ข้อความจากการยกเลิกที่ไม่สำเร็จเพราะสถานะเปลี่ยนไปแล้ว ค่าอื่นไม่แสดงอะไร */
function noticeText(notice: unknown): string | null {
  return typeof notice === "string" && Object.hasOwn(CANCEL_REFUSED, notice) ? CANCEL_REFUSED[notice as CancelRefusal] : null;
}

export function OrderDetail({
  order,
  confirmingCancel,
  notice,
}: {
  order: BuyerOrderDetail;
  confirmingCancel: boolean;
  notice?: unknown;
}) {
  const message = noticeText(notice);
  const others = order.group.filter((other) => other.orderNo !== order.orderNo);

  return (
    <article>
      <h1>คำสั่งซื้อ {order.orderNo}</h1>
      {message && (
        <p role="alert" className={styles.notice}>
          {message}
        </p>
      )}

      <section className={`card ${styles.section}`} aria-label="สถานะ">
        <div className={styles.row}>
          <strong>{order.shopName}</strong>
          <span className={styles.status}>{order.status}</span>
        </div>
        <p className={styles.muted}>สั่งเมื่อ {formatDateTime(order.orderedAt)}</p>
        {order.status === ORDER_STATUS.awaitingPayment && <p>จ่ายภายใน {formatDateTime(order.paymentDeadline)}</p>}
        {order.status === ORDER_STATUS.cancelled && order.cancelledAt && (
          <p>
            ยกเลิกเมื่อ {formatDateTime(order.cancelledAt)} เหตุผล: {order.cancelReason}
          </p>
        )}

        {order.payable &&
          (confirmingCancel ? (
            <CancelOrderForm orderNo={order.orderNo} message={cancelConfirmMessage(order.group)} />
          ) : (
            <div className={styles.actions}>
              <Link href={`/pay/${order.groupId}`} className="button">
                จ่ายเงิน
              </Link>
              <Link href={`/orders/${order.orderNo}?cancel=1`} className="button button-secondary">
                ยกเลิกคำสั่งซื้อ
              </Link>
            </div>
          ))}

        {order.payable && others.length > 0 && (
          <p>
            คำสั่งซื้ออื่นที่จ่ายรวมกัน:{" "}
            {others.map((other, index) => (
              <span key={other.orderNo}>
                {index > 0 && ", "}
                <Link href={`/orders/${other.orderNo}`}>{other.orderNo}</Link> ({other.shopName})
              </span>
            ))}
          </p>
        )}

        {order.trackingNo && (
          <div className={styles.actions}>
            <Link href={`/track/${order.trackingNo}`} className="button button-secondary">
              ติดตามพัสดุ
            </Link>
          </div>
        )}
      </section>

      <section className={`card ${styles.section}`}>
        <h2>สินค้า</h2>
        <ul className={styles.items}>
          {order.items.map((item) => (
            <li key={item.id} className={styles.item}>
              {item.coverImageUrl ? <img src={item.coverImageUrl} alt="" /> : <span />}
              <div>
                <div>{item.productName}</div>
                {item.variantLabel && <div className={styles.muted}>{item.variantLabel}</div>}
                <div className={styles.row}>
                  <span>
                    {formatBaht(item.unitPrice)} × {formatNumber(item.quantity)}
                  </span>
                  <span>{formatBaht(item.unitPrice * item.quantity)}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <dl className={styles.totals}>
          <dt>ราคาสินค้า</dt>
          <dd>{formatBaht(order.itemsTotal)}</dd>
          <dt>ค่าส่ง</dt>
          <dd>{formatBaht(order.shippingFee)}</dd>
          <dt>
            <strong>ยอดรวม</strong>
          </dt>
          <dd>
            <strong>{formatBaht(order.total)}</strong>
          </dd>
        </dl>
      </section>

      <section className={`card ${styles.section} ${styles.address}`}>
        <h2>ที่อยู่จัดส่ง</h2>
        <p>
          {order.shipTo.recipientName} {order.shipTo.phone}
        </p>
        <p>
          {order.shipTo.address} {order.shipTo.subdistrict} {order.shipTo.district} {order.shipTo.province}{" "}
          {order.shipTo.postcode}
        </p>
      </section>

      <Link href="/orders" className="button button-secondary">
        กลับไปรายการคำสั่งซื้อ
      </Link>
    </article>
  );
}
