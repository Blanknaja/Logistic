import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusChangeForm } from "@/features/delivery/components/status-change-form";
import { StatusChangeLinks } from "@/features/delivery/components/status-change-links";
import styles from "@/features/delivery/components/status-change.module.css";
import { getParcelForStatusChange } from "@/features/delivery/server/parcel-status";
import { getDb } from "@/shared/db";
import { formatThaiDateTime } from "@/shared/format";
import { requireAccount } from "@/shared/session";
import { ORDER_STATUS } from "@/shared/statuses";
import { Journey, PARCEL_JOURNEY } from "@/shared/ui/journey";
import { PageReveal } from "@/shared/ui/transitions";

export const metadata: Metadata = { title: "เปลี่ยนสถานะการจัดส่ง" };

export default async function ParcelStatusPage({ params, searchParams }: PageProps<"/parcels/[trackingNo]">) {
  const { trackingNo } = await params;
  const viewer = await requireAccount(`/parcels/${encodeURIComponent(trackingNo)}`);
  const parcel = getParcelForStatusChange(getDb(), trackingNo, viewer);
  if (!parcel) notFound();
  const { to, saved } = await searchParams;
  const chosen = parcel.nextStatuses.find((status) => status === to);

  return (
    <PageReveal>
      <div className={styles.page}>
        <h1 className={styles.title}>
          <span className={styles.eyebrow}>เปลี่ยนสถานะการจัดส่ง {parcel.trackingNo}</span> {parcel.status}
        </h1>
        {saved && !chosen && (
          <p role="status" className="notice">
            บันทึกแล้ว
          </p>
        )}
        {parcel.orderStatus === ORDER_STATUS.cancelled && <p className={`badge badge-alert ${styles.cancelled}`}>คำสั่งซื้อถูกยกเลิก</p>}
        {PARCEL_JOURNEY.includes(parcel.status) && (
          <div className={`card ${styles.journey}`}>
            <Journey steps={PARCEL_JOURNEY} current={PARCEL_JOURNEY.indexOf(parcel.status)} label="ขั้นของการจัดส่ง" />
          </div>
        )}
        <dl className={`card ${styles.facts}`}>
          <div>
            <dt>ร้าน</dt>
            <dd>{parcel.shopName}</dd>
          </div>
          <div>
            <dt>รายการล่าสุด</dt>
            <dd>
              <time dateTime={parcel.latest.at}>{formatThaiDateTime(parcel.latest.at)}</time> · {parcel.latest.location}
            </dd>
          </div>
        </dl>
        {chosen ? (
          <StatusChangeForm
            trackingNo={parcel.trackingNo}
            from={parcel.status}
            to={chosen}
            defaultProvince={parcel.defaultProvince}
          />
        ) : (
          <StatusChangeLinks trackingNo={parcel.trackingNo} nextStatuses={parcel.nextStatuses} />
        )}
        <p>
          <Link href={`/track/${encodeURIComponent(parcel.trackingNo)}`} className="link-action">
            ดูประวัติการจัดส่ง
          </Link>
        </p>
      </div>
    </PageReveal>
  );
}
