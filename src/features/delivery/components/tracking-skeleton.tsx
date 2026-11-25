import { LoadingState } from "@/shared/ui/states";
import styles from "./tracking.module.css";

/** หน้าติดตามพัสดุและหน้าค้นหาพัสดุโหลดไม่สำเร็จ หรือเกิน 10 วินาที (DLV-014) */
export const LOAD_FAILED = "โหลดข้อมูลไม่ได้ตอนนี้";

/** โครงหน้าติดตามพัสดุระหว่างรอข้อมูล คำว่า "กำลังโหลด" อยู่แทนประวัติ (DLV-014) */
export function TrackingSkeleton() {
  return (
    <div className={styles.page} data-skeleton>
      <h1>ติดตามพัสดุ</h1>
      <div className={styles.now}>
        <div className={`${styles.skeleton} ${styles.skeletonBig}`} />
        <div className={`${styles.skeleton} ${styles.skeletonShort}`} />
      </div>
      <section className={styles.section}>
        <h2>ประวัติการจัดส่ง</h2>
        <LoadingState />
      </section>
    </div>
  );
}
