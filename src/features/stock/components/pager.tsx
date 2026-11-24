import Link from "next/link";
import styles from "./stock.module.css";

/** ลิงก์ก่อนหน้าและถัดไป href รับเลขหน้าแล้วคืนที่อยู่ของหน้านั้น */
export function Pager({ page, pageCount, href }: { page: number; pageCount: number; href: (page: number) => string }) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="เลือกหน้า" className={styles.pager}>
      {page > 1 && (
        <Link href={href(page - 1)} className="button button-secondary">
          ก่อนหน้า
        </Link>
      )}
      <span>{`หน้า ${page} จาก ${pageCount}`}</span>
      {page < pageCount && (
        <Link href={href(page + 1)} className="button button-secondary">
          ถัดไป
        </Link>
      )}
    </nav>
  );
}
