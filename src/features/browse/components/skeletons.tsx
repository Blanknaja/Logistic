import { PAGE_SIZE } from "@/shared/paging";
import styles from "./browse.module.css";

// โครงสีเทาในตำแหน่งที่ข้อมูลจะมาแสดง (BRW-012)

const box = (...classes: string[]) => [styles.skeleton, ...classes].join(" ");

export function ResultsSkeleton() {
  return (
    <div role="status" aria-label="กำลังโหลด">
      <div className={box(styles.skeletonLine, styles.skeletonShort)} />
      <div className="chips">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={box(styles.skeletonChip)} />
        ))}
      </div>
      <div className={box(styles.skeletonLine, styles.skeletonShort)} />
      <ul className={styles.grid}>
        {Array.from({ length: PAGE_SIZE }, (_, i) => (
          <li key={i} className={box(styles.skeletonCard)} data-skeleton-card />
        ))}
      </ul>
    </div>
  );
}

export function ProductDetailSkeleton() {
  return (
    <div role="status" aria-label="กำลังโหลด" className={styles.detail}>
      <div className={styles.intro}>
        <div className={box(styles.skeletonLine, styles.skeletonShort)} />
        <div className={box(styles.skeletonLine)} />
      </div>
      <div className={box(styles.plate)} />
      <div className={styles.purchase}>
        <div className={box(styles.skeletonLine, styles.skeletonShort)} />
        <div className={box(styles.skeletonButton)} />
      </div>
    </div>
  );
}
