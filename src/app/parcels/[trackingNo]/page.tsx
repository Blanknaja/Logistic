import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusChangeForm } from "@/features/delivery/components/status-change-form";
import { StatusChangeLinks } from "@/features/delivery/components/status-change-links";
import styles from "@/features/delivery/components/status-change.module.css";
import { getParcelForStatusChange } from "@/features/delivery/server/parcel-status";
import { getDb } from "@/shared/db";
import { formatDateTime } from "@/shared/format";
import { requireAccount } from "@/shared/session";
import { ORDER_STATUS } from "@/shared/statuses";

export const metadata: Metadata = { title: "เปลี่ยนสถานะการจัดส่ง" };

export default async function ParcelStatusPage({ params, searchParams }: PageProps<"/parcels/[trackingNo]">) {
  const { trackingNo } = await params;
  const viewer = await requireAccount(`/parcels/${encodeURIComponent(trackingNo)}`);
  const parcel = getParcelForStatusChange(getDb(), trackingNo, viewer);
  if (!parcel) notFound();
  const { to, saved } = await searchParams;
  const chosen = parcel.nextStatuses.find((status) => status === to);

  return (
    <div className={styles.page}>
      <h1>เปลี่ยนสถานะการจัดส่ง</h1>
      {saved && !chosen && (
        <p role="status" className={styles.notice}>
          บันทึกแล้ว
        </p>
      )}
      <dl className={styles.facts}>
        <dt>เลขติดตามพัสดุ</dt>
        <dd>{parcel.trackingNo}</dd>
        <dt>ร้าน</dt>
        <dd>{parcel.shopName}</dd>
        <dt>สถานะการจัดส่ง</dt>
        <dd>{parcel.status}</dd>
        <dt>สถานะคำสั่งซื้อ</dt>
        <dd>{parcel.orderStatus}</dd>
        <dt>รายการล่าสุด</dt>
        <dd>
          {parcel.latest.status} {formatDateTime(parcel.latest.at)} {parcel.latest.location}
        </dd>
      </dl>
      {parcel.orderStatus === ORDER_STATUS.cancelled && <p className={styles.notice}>คำสั่งซื้อถูกยกเลิก</p>}
      {chosen ? (
        <StatusChangeForm trackingNo={parcel.trackingNo} from={parcel.status} to={chosen} />
      ) : (
        <StatusChangeLinks trackingNo={parcel.trackingNo} nextStatuses={parcel.nextStatuses} />
      )}
      <p>
        <Link href={`/track/${encodeURIComponent(parcel.trackingNo)}`}>ดูประวัติการจัดส่ง</Link>
      </p>
    </div>
  );
}
