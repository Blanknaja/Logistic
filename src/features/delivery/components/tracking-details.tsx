import type { ReactNode } from "react";
import { routeText } from "@/features/delivery/server/route";
import type { TrackingView } from "@/features/delivery/server/tracking";
import { formatThaiDateTime } from "@/shared/format";
import { ORDER_STATUS, RECEIPT_CONFIRMED_BY } from "@/shared/statuses";
import { ConfirmReceipt } from "./confirm-receipt";
import { DeliveryMap } from "./delivery-map";
import styles from "./tracking.module.css";

type ConfirmAction = (formData: FormData) => Promise<{ error: string | null }>;

function DateTime({ value }: { value: string }) {
  return <time dateTime={value}>{formatThaiDateTime(value)}</time>;
}

/**
 * เนื้อหาของหน้าติดตามพัสดุ (DLV-010) หัวเรื่องคือสถานะการจัดส่ง ใต้หัวเรื่องคือสิ่งที่ทำได้ตอนนี้
 * สถานะคำสั่งซื้อแสดงเป็นประโยคเฉพาะตอนที่บอกเรื่องที่สถานะการจัดส่งไม่ได้บอก: ถูกยกเลิก หรือยืนยันรับสินค้าแล้วหรือยัง
 * statusControls แสดงเฉพาะคนที่เปลี่ยนสถานะได้
 */
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
      <div className={styles.now}>
        <h1 className={styles.title}>
          <span className={styles.eyebrow}>ติดตามพัสดุ {view.trackingNo}</span> {view.parcelStatus}
        </h1>
        {view.orderStatus === ORDER_STATUS.cancelled && <p className={styles.cancelled}>คำสั่งซื้อถูกยกเลิก</p>}
        {receipt && (
          <p role="status">
            {receipt.by === RECEIPT_CONFIRMED_BY.buyer ? "ผู้ซื้อยืนยันรับสินค้าแล้ว" : "ระบบยืนยันรับสินค้าให้อัตโนมัติ เพราะครบ 7 วัน"}{" "}
            <DateTime value={receipt.at} />
          </p>
        )}
        {view.canConfirmReceipt && <ConfirmReceipt trackingNo={view.trackingNo} action={confirmAction} />}
        {view.autoConfirmAt && (
          <p className={styles.note}>
            ถ้าไม่กดยืนยัน ระบบจะยืนยันให้อัตโนมัติวันที่ <DateTime value={view.autoConfirmAt} />
          </p>
        )}
        {view.canChangeStatus && <section data-seam="parcel-status-controls">{statusControls}</section>}
      </div>

      <section className={styles.mapBlock} aria-labelledby="tracking-map">
        <h2 id="tracking-map" className="visually-hidden">
          แผนที่การจัดส่ง
        </h2>
        <DeliveryMap route={view.route} />
        <p>{routeText(view.route)}</p>
        <p className={styles.note}>แผนที่แสดงจังหวัดที่พัสดุผ่านมาแล้ว ไม่ใช่ตำแหน่งปัจจุบัน</p>
      </section>

      <section className={styles.history} aria-labelledby="tracking-history">
        <h2 id="tracking-history">ประวัติการจัดส่ง</h2>
        <ol className={styles.timeline}>
          {view.history.map((entry, index) => (
            <li key={index}>
              <p>{entry.status}</p>
              <p className={styles.note}>
                <DateTime value={entry.at} /> · {entry.location}
                {entry.province && ` · ${entry.province}`}
              </p>
              {entry.receiverName && <p className={styles.note}>ผู้รับ {entry.receiverName}</p>}
              {entry.failureReason && <p className={styles.note}>เหตุผล {entry.failureReason}</p>}
              {entry.changedBy && <p className={styles.note}>เปลี่ยนโดย {entry.changedBy}</p>}
            </li>
          ))}
        </ol>
        {view.history.length === 1 && view.orderStatus !== ORDER_STATUS.cancelled && (
          <p className={styles.note}>ร้านกำลังเตรียมของ ยังไม่มีความเคลื่อนไหวอื่น</p>
        )}
      </section>

      <dl className={styles.facts}>
        <div>
          <dt>ร้าน</dt>
          <dd>{view.shopName}</dd>
        </div>
        {origin && (
          <div>
            <dt>ที่อยู่ต้นทาง</dt>
            <dd>
              <address>
                {origin.senderName} {origin.phone}
                <br />
                {origin.address} {origin.subdistrict} {origin.district} {origin.province} {origin.postcode}
              </address>
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
