import Link from "next/link";
import type { OrderDetail, ParcelSummary } from "@/features/shop-orders/server/orders";
import { formatBaht, formatDateTime, formatNumber } from "@/shared/format";
import { ORDER_STATUS } from "@/shared/statuses";
import { ErrorState } from "@/shared/ui/states";
import { LiveUpdates } from "./live-updates";
import { ShippingActions } from "./shipping-actions";
import styles from "./shop-orders.module.css";

type Props = {
  order: OrderDetail;
  /** "unavailable" เมื่ออ่านข้อมูลพัสดุไม่ได้ ส่วนอื่นของหน้ายังแสดงได้ (ORD-008) */
  parcel: ParcelSummary | null | "unavailable";
  backHref: string;
  version: string;
};

/** หน้ารายละเอียดคำสั่งซื้อของร้าน อ่านอย่างเดียว ไม่มีช่องแก้ข้อมูล (ORD-005 ถึง ORD-009 ORD-015) */
export function OrderDetailView({ order, parcel, backHref, version }: Props) {
  const cancelled = order.status === ORDER_STATUS.cancelled;
  return (
    <>
      <h1>คำสั่งซื้อ {order.orderNo}</h1>
      <LiveUpdates version={version} />
      {cancelled && <p className={styles.notice}>คำสั่งซื้อนี้ถูกยกเลิกแล้ว</p>}

      <section className={`card ${styles.section}`} aria-labelledby="order-summary">
        <h2 id="order-summary">สถานะคำสั่งซื้อ</h2>
        <p className={styles.status}>{order.status}</p>
        <p className={styles.muted}>สั่งซื้อเมื่อ {formatDateTime(order.orderedAt)}</p>
      </section>

      <section className={`card ${styles.section}`} aria-labelledby="order-items">
        <h2 id="order-items">สินค้า</h2>
        <ul className={styles.items}>
          {order.items.map((item, index) => (
            <li key={index} className={styles.item}>
              {item.coverImageUrl ? <img src={item.coverImageUrl} alt="" /> : <span className={styles.noImage} />}
              <span>
                {`${item.productName}${item.variantLabel ? ` ${item.variantLabel}` : ""} ${formatBaht(item.unitPrice)} × ${formatNumber(item.quantity)} = ${formatBaht(item.unitPrice * item.quantity)}`}
              </span>
            </li>
          ))}
        </ul>
        <dl className={styles.totals}>
          <dt>ยอดรวมสินค้า</dt>
          <dd>{formatBaht(order.itemsTotal)}</dd>
          <dt>ค่าส่ง</dt>
          <dd>{formatBaht(order.shippingFee)}</dd>
          <dt className={styles.grandTotal}>ยอดรวมทั้งหมด</dt>
          <dd className={styles.grandTotal}>{formatBaht(order.total)}</dd>
        </dl>
      </section>

      <section className={`card ${styles.section}`} aria-labelledby="order-recipient">
        <h2 id="order-recipient">ที่อยู่จัดส่ง</h2>
        <p>
          {order.recipient.name}
          <br />
          {order.recipient.phone}
          <br />
          {order.recipient.address}
        </p>
      </section>

      <section className={`card ${styles.section}`} aria-labelledby="order-payment">
        <h2 id="order-payment">การจ่ายเงิน</h2>
        <p>{order.payment ? `จ่ายแล้ว ${order.payment.method} ${formatDateTime(order.payment.paidAt)}` : "ยังไม่จ่าย"}</p>
      </section>

      <section className={`card ${styles.section}`} aria-labelledby="order-parcel">
        <h2 id="order-parcel">การจัดส่ง</h2>
        <ParcelInfo parcel={parcel} cancelled={cancelled} />
      </section>

      <div className={styles.actions}>
        <ShippingActions
          orderNo={order.orderNo}
          status={order.status}
          trackingNo={parcel && parcel !== "unavailable" ? parcel.trackingNo : null}
        />
        <Link href={backHref} className="button button-secondary">
          กลับไปหน้ารายการ
        </Link>
      </div>
    </>
  );
}

function ParcelInfo({ parcel, cancelled }: { parcel: Props["parcel"]; cancelled: boolean }) {
  if (parcel === "unavailable") return <ErrorState title="โหลดข้อมูลการจัดส่งไม่ได้" />;
  if (!parcel) return <p>{cancelled ? "ไม่มีพัสดุ" : "ยังไม่มีพัสดุ จะมีเมื่อผู้ซื้อจ่ายเงินแล้ว"}</p>;
  return (
    <dl className={styles.totals}>
      <dt>เลขติดตามพัสดุ</dt>
      <dd>{parcel.trackingNo}</dd>
      <dt>สถานะการจัดส่ง</dt>
      <dd>{parcel.status}</dd>
      <dt>เปลี่ยนเมื่อ</dt>
      <dd>{formatDateTime(parcel.changedAt)}</dd>
    </dl>
  );
}
