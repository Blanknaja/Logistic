import browse from "@/features/browse/components/browse.module.css";
import { CardSkeleton } from "@/features/browse/components/skeletons";
import { LoadingTimeout } from "@/shared/ui/loading-timeout";
import styles from "./shop.module.css";

// โครงหน้าระหว่างรอข้อมูล ครบ 10 วินาทีเปลี่ยนเป็น "โหลดข้อมูลไม่สำเร็จ" พร้อมปุ่ม "ลองใหม่" (SHP-013)

const box = (...classes: string[]) => [browse.skeleton, ...classes].join(" ");

function Identity() {
  return (
    <div className={styles.identity}>
      <div className={box(styles.logo)} />
      <div className={box(browse.skeletonLine, browse.skeletonShort)} />
    </div>
  );
}

/** หน้าเปิดร้านและหน้าตั้งค่าร้าน ปุ่มบันทึกกดไม่ได้ และไม่แสดงฟอร์มว่างแทนข้อมูลที่ยังมาไม่ถึง */
export function ShopFormSkeleton({ submitLabel }: { submitLabel: string }) {
  return (
    <LoadingTimeout>
      <div role="status" aria-label="กำลังโหลด" className={styles.formPage}>
        <div className={styles.formIntro}>
          <div className={box(browse.skeletonLine, browse.skeletonShort)} />
        </div>
        <div>
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className={box(browse.skeletonLine)} />
          ))}
          <div className={styles.submitBar}>
            <div className={styles.actions}>
              <button type="button" className="button" disabled>
                {submitLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </LoadingTimeout>
  );
}

export function SellerHomeSkeleton() {
  return (
    <LoadingTimeout>
      <div role="status" aria-label="กำลังโหลด">
        <Identity />
        <div className={styles.stats}>
          <div className={box(browse.skeletonButton)} />
          <div className={box(browse.skeletonButton)} />
        </div>
      </div>
    </LoadingTimeout>
  );
}

export function StorefrontSkeleton() {
  return (
    <LoadingTimeout>
      <div role="status" aria-label="กำลังโหลด">
        <Identity />
        <div className={styles.about}>
          <div className={box(browse.skeletonLine)} />
          <div className={box(browse.skeletonLine, browse.skeletonShort)} />
        </div>
        <ul className={browse.grid}>
          {Array.from({ length: 8 }, (_, i) => (
            <CardSkeleton key={i} />
          ))}
        </ul>
      </div>
    </LoadingTimeout>
  );
}
