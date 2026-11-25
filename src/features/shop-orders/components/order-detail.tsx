import Link from "next/link";
import type { OrderDetail, ParcelSummary } from "@/features/shop-orders/server/orders";
import { formatBaht, formatThaiDateTime, formatNumber } from "@/shared/format";
import { ORDER_STATUS } from "@/shared/statuses";
import { ErrorState } from "@/shared/ui/states";
import { CopyText } from "./copy-text";
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

/**
 * หน้ารายละเอียดคำสั่งซื้อของร้าน อ่านอย่างเดียว ไม่มีช่องแก้ข้อมูล (ORD-005 ถึง ORD-009 ORD-015)
 * หัวเรื่องคือสถานะ ปุ่มจัดส่งอยู่ใต้หัวเรื่อง ของที่ต้องแพ็กอยู่ซ้าย ที่อยู่ที่ต้องส่งอยู่ขวา
 */
export function OrderDetailView({ order, parcel, backHref, version }: Props) {
  const cancelled = order.status === ORDER_STATUS.cancelled;
  const { name, phone, address } = order.recipient;
  return (
    <>
      <Link href={backHref} className={`link-action ${styles.back}`}>
        กลับไปหน้ารายการ
      </Link>
      <LiveUpdates version={version} />
      <header className={styles.intro}>
        <h1>{order.status}</h1>
        <p className={styles.muted}>
          คำสั่งซื้อ {order.orderNo} · สั่งซื้อเมื่อ <time dateTime={order.orderedAt}>{formatThaiDateTime(order.orderedAt)}</time>
        </p>
        {cancelled && <p>คำสั่งซื้อนี้ถูกยกเลิกแล้ว</p>}
        <ShippingActions
          orderNo={order.orderNo}
          status={order.status}
          trackingNo={parcel && parcel !== "unavailable" ? parcel.trackingNo : null}
        />
      </header>

      <div className={styles.detail}>
        <section aria-labelledby="order-items">
          <h2 id="order-items" className={styles.label}>
            สินค้า
          </h2>
          <ul className={styles.items}>
            {order.items.map((item, index) => (
              <li key={index} className={styles.item}>
                {item.coverImageUrl ? <img src={item.coverImageUrl} alt="" /> : <span className={styles.noImage} />}
                <span className={styles.itemName}>
                  {item.productName}
                  {item.variantLabel && <span className={styles.muted}> {item.variantLabel}</span>}
                </span>
                {/* ชิ้นเดียว ราคาต่อชิ้นเท่ากับยอดของรายการ จึงบอกครั้งเดียว */}
                <span className={styles.itemQuantity}>
                  {item.quantity === 1 ? "1 ชิ้น" : `${formatBaht(item.unitPrice)} × ${formatNumber(item.quantity)}`}
                </span>
                <span className={styles.itemTotal}>{formatBaht(item.unitPrice * item.quantity)}</span>
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

        <div className={styles.aside}>
          <section aria-labelledby="order-recipient">
            <h2 id="order-recipient" className={styles.label}>
              ที่อยู่จัดส่ง
            </h2>
            <p className={styles.address}>
              {name}
              <br />
              {phone}
              <br />
              {address}
            </p>
            <CopyText text={`${name}\n${phone}\n${address}`} label="คัดลอกที่อยู่" />
          </section>

          <section aria-labelledby="order-payment">
            <h2 id="order-payment" className={styles.label}>
              การจ่ายเงิน
            </h2>
            <p>{order.payment ? `จ่ายแล้ว ${order.payment.method} ${formatThaiDateTime(order.payment.paidAt)}` : "ยังไม่จ่าย"}</p>
          </section>

          <section aria-labelledby="order-parcel">
            <h2 id="order-parcel" className={styles.label}>
              การจัดส่ง
            </h2>
            <ParcelInfo parcel={parcel} cancelled={cancelled} />
          </section>
        </div>
      </div>
    </>
  );
}

function ParcelInfo({ parcel, cancelled }: { parcel: Props["parcel"]; cancelled: boolean }) {
  if (parcel === "unavailable") return <ErrorState title="โหลดข้อมูลการจัดส่งไม่ได้" />;
  if (!parcel) return <p>{cancelled ? "ไม่มีพัสดุ" : "ยังไม่มีพัสดุ จะมีเมื่อผู้ซื้อจ่ายเงินแล้ว"}</p>;
  return (
    <dl className={styles.facts}>
      <dt>เลขติดตามพัสดุ</dt>
      <dd>{parcel.trackingNo}</dd>
      <dt>สถานะการจัดส่ง</dt>
      <dd>{parcel.status}</dd>
      <dt>เปลี่ยนเมื่อ</dt>
      <dd>{formatThaiDateTime(parcel.changedAt)}</dd>
    </dl>
  );
}
