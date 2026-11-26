import { PAGE_SIZE } from "@/shared/paging";
import styles from "./browse.module.css";

// โครงสีเทาในตำแหน่งที่ข้อมูลจะมาแสดง (BRW-012)

const box = (...classes: string[]) => ["skeleton", ...classes].join(" ");

/** การ์ดสินค้าระหว่างโหลด ขนาดเท่าการ์ดจริง หน้าจึงไม่กระโดดตอนข้อมูลมา */
export function CardSkeleton() {
  return (
    <li data-skeleton-card>
      <div className={box(styles.skeletonCard)} />
      <div className={box(styles.skeletonLine)} />
      <div className={box(styles.skeletonLine, styles.skeletonShort)} />
    </li>
  );
}

export function ResultsSkeleton() {
  return (
    <div role="status" aria-label="กำลังโหลด">
      <div className={styles.categories}>
        <div className="chips">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className={box(styles.skeletonChip)} />
          ))}
        </div>
      </div>
      <div className={styles.toolbar}>
        <div className={box(styles.skeletonLine, styles.skeletonShort)} />
      </div>
      <ul className={styles.grid}>
        {Array.from({ length: PAGE_SIZE }, (_, i) => (
          <CardSkeleton key={i} />
        ))}
      </ul>
    </div>
  );
}

export function ProductDetailSkeleton() {
  return (
    <div role="status" aria-label="กำลังโหลด" className={styles.detail}>
      <div className={styles.buyArea}>
        <div className={styles.name}>
          <div className={box(styles.skeletonLine)} />
        </div>
        <div className={styles.gallery}>
          <div className={box(styles.plate)} />
        </div>
        <div className={styles.purchase}>
          <div className={box(styles.skeletonLine, styles.skeletonShort)} />
          <div className={box(styles.skeletonButton)} />
        </div>
      </div>
    </div>
  );
}
