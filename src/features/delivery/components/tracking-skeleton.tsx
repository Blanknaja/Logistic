import { LoadingState } from "@/shared/ui/states";
import mapStyles from "./delivery-map.module.css";
import styles from "./tracking.module.css";

/** หน้าติดตามพัสดุและหน้าค้นหาพัสดุโหลดไม่สำเร็จ หรือเกิน 10 วินาที (DLV-014) */
export const LOAD_FAILED = "โหลดข้อมูลไม่ได้ตอนนี้";

/** โครงหน้าติดตามพัสดุระหว่างรอข้อมูล วางที่เดียวกับหน้าจริง คำว่า "กำลังโหลด" อยู่แทนประวัติ (DLV-014) */
export function TrackingSkeleton() {
  return (
    <div className={styles.page} data-skeleton>
      <div className={styles.now}>
        <h1 className={styles.title}>
          <span className={styles.eyebrow}>ติดตามพัสดุ</span>
        </h1>
        <div className={styles.skeleton} />
      </div>
      <div className={styles.mapBlock}>
        <div className={mapStyles.map} />
      </div>
      <section className={styles.history}>
        <h2>ประวัติการจัดส่ง</h2>
        <LoadingState level={2} />
      </section>
    </div>
  );
}
