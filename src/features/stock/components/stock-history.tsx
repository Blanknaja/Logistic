import Link from "next/link";
import type { StockHistory } from "@/features/stock/server/stock";
import { formatDateTime, formatNumber } from "@/shared/format";
import { EmptyState } from "@/shared/ui/states";
import { Pager } from "./pager";
import styles from "./stock.module.css";

const signed = (change: number) => (change > 0 ? `+${formatNumber(change)}` : formatNumber(change));

/** ประวัติอ่านอย่างเดียว ไม่มีปุ่มแก้หรือลบบรรทัด (INV-015) */
export function StockHistoryView({ history }: { history: StockHistory }) {
  return (
    <>
      <Link href="/seller/stock" className={styles.back}>
        กลับไปหน้าสต็อก
      </Link>
      <header className={styles.intro}>
        <h1>ประวัติสต็อก</h1>
        <p className={styles.name}>
          {history.productName}
          {history.variantLabel && <span className={styles.variant}> {history.variantLabel}</span>}
        </p>
        <p className={styles.current}>{`สต็อกปัจจุบัน ${formatNumber(history.stock)} ชิ้น`}</p>
      </header>
      {history.entries.length === 0 ? (
        <EmptyState title="ยังไม่มีการเปลี่ยนสต็อก" />
      ) : (
        <ol className={styles.history}>
          {history.entries.map((entry) => (
            <li key={entry.id} className={styles.entry}>
              <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>
              <span>{`${entry.reason} ${signed(entry.change)} เหลือ ${formatNumber(entry.stockAfter)}`}</span>
              {entry.orderNo && <span className={styles.orderNo}>{`คำสั่งซื้อ ${entry.orderNo}`}</span>}
            </li>
          ))}
        </ol>
      )}
      <Pager
        page={history.page}
        pageCount={history.pageCount}
        href={(page) => `/seller/stock/${history.variantId}${page > 1 ? `?page=${page}` : ""}`}
      />
    </>
  );
}
