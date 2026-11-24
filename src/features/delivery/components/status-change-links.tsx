import Link from "next/link";
import type { ParcelStatus } from "@/shared/statuses";
import styles from "./status-change.module.css";

/**
 * ปุ่ม "เปลี่ยนเป็น ..." ของขั้นถัดไป (DLV-003) พาไปฟอร์มที่ /parcels/[trackingNo]?to=...
 * หน้าติดตามพัสดุใช้ตัวนี้ได้ โดยส่ง nextStatuses จาก getParcelForStatusChange ซึ่งเป็น null ถ้าคนดูไม่มีสิทธิ์
 */
export function StatusChangeLinks({ trackingNo, nextStatuses }: { trackingNo: string; nextStatuses: ParcelStatus[] }) {
  if (nextStatuses.length === 0) return null;
  return (
    <div className={styles.actions}>
      {nextStatuses.map((status) => (
        <Link
          key={status}
          href={{ pathname: `/parcels/${encodeURIComponent(trackingNo)}`, query: { to: status } }}
          className="button"
        >
          เปลี่ยนเป็น {status}
        </Link>
      ))}
    </div>
  );
}
