import Link from "next/link";
import type { StockHistory } from "@/features/stock/server/stock";
import { formatThaiDateTime, formatNumber } from "@/shared/format";
import { EmptyState } from "@/shared/ui/states";
import { Pager } from "./pager";
import { StockBadge } from "./stock-row";
import styles from "./stock.module.css";

const signed = (change: number) => (change > 0 ? `+${formatNumber(change)}` : formatNumber(change));

/** ประวัติอ่านอย่างเดียว ไม่มีปุ่มแก้หรือลบบรรทัด (INV-015) */
export function StockHistoryView({ history }: { history: StockHistory }) {
  return (
    <>
      <Link href="/seller/stock" className={`link-action ${styles.back}`}>
        กลับไปหน้าสต็อก
      </Link>
      <header className={styles.intro}>
        <h1>ประวัติสต็อก</h1>
        <p className={styles.subject}>
          {history.productName}
          {history.variantLabel && <span className={styles.variant}> {history.variantLabel}</span>}
        </p>
        <p className={styles.current}>
          {`สต็อกปัจจุบัน ${formatNumber(history.stock)} ชิ้น`} <StockBadge stock={history.stock} />
        </p>
      </header>
      {history.entries.length === 0 ? (
        <EmptyState title="ยังไม่มีการเปลี่ยนสต็อก" />
      ) : (
        <div className={styles.table}>
          <div className={`${styles.head} ${styles.historyHead}`} aria-hidden="true">
            <span>เวลา</span>
            <span>เหตุ</span>
            <span className={styles.end}>เปลี่ยน</span>
            <span className={styles.end}>เหลือ</span>
            <span>คำสั่งซื้อ</span>
          </div>
          <ol className={styles.history}>
            {history.entries.map((entry) => (
              <li key={entry.id} className={styles.entry}>
                <time dateTime={entry.createdAt} className={styles.when}>
                  {formatThaiDateTime(entry.createdAt)}
                </time>
                <span className={styles.reason}>{entry.reason}</span>
                <span className={`${styles.change} ${styles.end}`}>{signed(entry.change)}</span>
                <span className={`${styles.after} ${styles.end}`}>
                  <span className={styles.cellLabel}>เหลือ </span>
                  {formatNumber(entry.stockAfter)}
                </span>
                <span className={styles.orderNo}>
                  {entry.orderNo && (
                    <>
                      <span className={styles.cellLabel}>คำสั่งซื้อ </span>
                      {entry.orderNo}
                    </>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <Pager
        page={history.page}
        pageCount={history.pageCount}
        href={(page) => `/seller/stock/${history.variantId}${page > 1 ? `?page=${page}` : ""}`}
      />
    </>
  );
}
