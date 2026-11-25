import type { ReactNode } from "react";
import { routeText } from "@/features/delivery/server/route";
import type { TrackingView } from "@/features/delivery/server/tracking";
import { formatDateTime } from "@/shared/format";
import { ORDER_STATUS, RECEIPT_CONFIRMED_BY } from "@/shared/statuses";
import { ConfirmReceipt } from "./confirm-receipt";
import { DeliveryMap } from "./delivery-map";
import styles from "./tracking.module.css";

type ConfirmAction = (formData: FormData) => Promise<{ error: string | null }>;

/** เนื้อหาของหน้าติดตามพัสดุ (DLV-010) statusControls แสดงเฉพาะคนที่เปลี่ยนสถานะได้ */
export function TrackingDetails({
  view,
  confirmAction,
  statusControls,
}: {
  view: TrackingView;
  confirmAction: ConfirmAction;
  statusControls: ReactNode;
}) {
  const { receipt, origin } = view;
  return (
    <div className={styles.page}>
      <h1>ติดตามพัสดุ</h1>

      <div className={styles.now}>
        <dl className={styles.statusNow}>
          <dt>สถานะการจัดส่ง</dt>
          <dd>{view.parcelStatus}</dd>
        </dl>
        <div className={styles.detail}>
          <dl className={styles.facts}>
            <dt>เลขติดตามพัสดุ</dt>
            <dd>{view.trackingNo}</dd>
            <dt>ร้าน</dt>
            <dd>{view.shopName}</dd>
            <dt>สถานะคำสั่งซื้อ</dt>
            <dd>{view.orderStatus}</dd>
          </dl>
          {view.orderStatus === ORDER_STATUS.cancelled && (
            <p className={`${styles.notice} ${styles.cancelled}`}>คำสั่งซื้อถูกยกเลิก</p>
          )}
          {receipt && (
            <p role="status" className={styles.notice}>
              {receipt.by === RECEIPT_CONFIRMED_BY.buyer
                ? `ผู้ซื้อยืนยันรับสินค้าแล้ว ${formatDateTime(receipt.at)}`
                : `ระบบยืนยันรับสินค้าให้อัตโนมัติ เพราะครบ 7 วัน ${formatDateTime(receipt.at)}`}
            </p>
          )}
          {view.autoConfirmAt && (
            <p className={styles.notice}>
              {`ถ้าไม่กดยืนยัน ระบบจะยืนยันให้อัตโนมัติวันที่ ${formatDateTime(view.autoConfirmAt)}`}
            </p>
          )}
          {view.canConfirmReceipt && <ConfirmReceipt trackingNo={view.trackingNo} action={confirmAction} />}
          {view.canChangeStatus && (
            <section data-seam="parcel-status-controls" className={styles.receipt}>
              {statusControls}
            </section>
          )}
        </div>
      </div>

      <section className={styles.section} aria-labelledby="tracking-map">
        <h2 id="tracking-map">แผนที่การจัดส่ง</h2>
        <div className={styles.route}>
          <DeliveryMap route={view.route} />
          <p>{routeText(view.route)}</p>
          <p className={styles.meta}>แผนที่แสดงจังหวัดที่พัสดุผ่านมาแล้ว ไม่ใช่ตำแหน่งปัจจุบัน</p>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="tracking-history">
        <h2 id="tracking-history">ประวัติการจัดส่ง</h2>
        <div>
          <ol className={styles.history}>
            {view.history.map((entry, index) => (
              <li key={index}>
                <span className={styles.status}>{entry.status}</span>
                <p className={styles.meta}>
                  <time dateTime={entry.at}>{formatDateTime(entry.at)}</time> · {entry.location}
                  {entry.province && ` · ${entry.province}`}
                </p>
                {entry.receiverName && <p className={styles.meta}>ผู้รับ {entry.receiverName}</p>}
                {entry.failureReason && <p className={styles.meta}>เหตุผล {entry.failureReason}</p>}
                {entry.changedBy && <p className={styles.meta}>เปลี่ยนโดย {entry.changedBy}</p>}
              </li>
            ))}
          </ol>
          {view.history.length === 1 && view.orderStatus !== ORDER_STATUS.cancelled && (
            <p className={styles.hint}>ร้านกำลังเตรียมของ ยังไม่มีความเคลื่อนไหวอื่น</p>
          )}
        </div>
      </section>

      {origin && (
        <section className={styles.section} aria-labelledby="tracking-origin">
          <h2 id="tracking-origin">ที่อยู่ต้นทาง</h2>
          <address className={styles.address}>
            {origin.senderName} {origin.phone}
            <br />
            {origin.address} {origin.subdistrict} {origin.district} {origin.province} {origin.postcode}
          </address>
        </section>
      )}
    </div>
  );
}
