import Link from "next/link";
import { CANCEL_REFUSED, type BuyerOrderDetail, type CancelRefusal } from "@/features/checkout/server/buyer-orders";
import { formatBaht, formatThaiDateTime, formatNumber } from "@/shared/format";
import { ORDER_STATUS } from "@/shared/statuses";
import { CancelOrderForm } from "./cancel-order-form";
import { PayButton } from "./pay-button";
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
    <article className={styles.detail}>
      <h1>{order.status}</h1>
      <p className={styles.meta}>
        คำสั่งซื้อ {order.orderNo} · {order.shopName} · สั่งเมื่อ {formatThaiDateTime(order.orderedAt)}
      </p>
      {message && (
        <p role="alert" className={styles.notice}>
          {message}
        </p>
      )}

      <section className={styles.now} aria-label="สถานะ">
        {order.status === ORDER_STATUS.awaitingPayment && (
          <p className={styles.deadline}>จ่ายภายใน {formatThaiDateTime(order.paymentDeadline)}</p>
        )}
        {order.status === ORDER_STATUS.cancelled && order.cancelledAt && (
          <p>
            ยกเลิกเมื่อ {formatThaiDateTime(order.cancelledAt)} เหตุผล: {order.cancelReason}
          </p>
        )}

        {order.payable &&
          (confirmingCancel ? (
            <CancelOrderForm orderNo={order.orderNo} message={cancelConfirmMessage(order.group)} />
          ) : (
            <div className={styles.actions}>
              <PayButton orderNo={order.orderNo} groupId={order.groupId} />
              <Link href={`/orders/${order.orderNo}?cancel=1`} className="link-action">
                ยกเลิกคำสั่งซื้อ
              </Link>
            </div>
          ))}

        {order.payable && others.length > 0 && (
          <p className={styles.muted}>
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
            <Link href={`/track/${order.trackingNo}`} className="button">
              ติดตามพัสดุ
            </Link>
          </div>
        )}
      </section>

      <div className={styles.columns}>
        <section className={styles.section}>
          <h2>สินค้า</h2>
          <ul className={styles.items}>
            {order.items.map((item) => (
              <li key={item.id} className={styles.item}>
                {item.coverImageUrl ? <img src={item.coverImageUrl} alt="" /> : <span />}
                <div>
                  <p>{item.productName}</p>
                  {item.variantLabel && <p className={styles.muted}>{item.variantLabel}</p>}
                  {/* ชิ้นเดียว ราคาต่อชิ้นเท่ากับราคาของรายการ จึงบอกแค่จำนวน */}
                  <p className={styles.muted}>
                    {item.quantity === 1 ? "1 ชิ้น" : `${formatBaht(item.unitPrice)} × ${formatNumber(item.quantity)}`}
                  </p>
                </div>
                <span>{formatBaht(item.unitPrice * item.quantity)}</span>
              </li>
            ))}
          </ul>
          <dl className={styles.totals}>
            {order.items.length > 1 && (
              <div>
                <dt>ราคาสินค้า</dt>
                <dd>{formatBaht(order.itemsTotal)}</dd>
              </div>
            )}
            <div>
              <dt>ค่าส่ง</dt>
              <dd>{formatBaht(order.shippingFee)}</dd>
            </div>
            <div className={styles.total}>
              <dt>ยอดรวม</dt>
              <dd>{formatBaht(order.total)}</dd>
            </div>
          </dl>
        </section>

        <section className={styles.section}>
          <h2>ที่อยู่จัดส่ง</h2>
          <p>
            {order.shipTo.recipientName} {order.shipTo.phone}
          </p>
          <p className={styles.muted}>
            {order.shipTo.address} {order.shipTo.subdistrict} {order.shipTo.district} {order.shipTo.province}{" "}
            {order.shipTo.postcode}
          </p>
        </section>
      </div>

      <Link href="/orders" className="link-action">
        กลับไปรายการคำสั่งซื้อ
      </Link>
    </article>
  );
}
