import Link from "next/link";
import { STOCK_LABEL } from "@/features/stock/server/labels";
import type { StockFilter, StockList } from "@/features/stock/server/stock";
import { formatNumber } from "@/shared/format";
import { EmptyState } from "@/shared/ui/states";
import { Pager } from "./pager";
import { StockRowItem } from "./stock-row";
import styles from "./stock.module.css";

const FILTERS: { value: StockFilter; label: string }[] = [
  { value: "all", label: "ทั้งหมด" },
  { value: "low", label: STOCK_LABEL.low },
  { value: "out", label: STOCK_LABEL.out },
];

function stockHref(filter: StockFilter, page = 1): string {
  const query = new URLSearchParams();
  if (filter !== "all") query.set("filter", filter);
  if (page > 1) query.set("page", String(page));
  const text = query.toString();
  return text ? `/seller/stock?${text}` : "/seller/stock";
}

export function StockListView({ list, filter }: { list: StockList; filter: StockFilter }) {
  if (list.counts.all === 0) {
    return (
      <>
        <h1>สต็อก</h1>
        <EmptyState title="ยังไม่มีสินค้า ลงสินค้าก่อนจึงจะจัดการสต็อกได้">
          <Link href="/seller/products/new" className="button">
            ลงสินค้า
          </Link>
        </EmptyState>
      </>
    );
  }

  const current = FILTERS.find((item) => item.value === filter) ?? FILTERS[0];
  return (
    <>
      <h1>สต็อก</h1>
      <nav aria-label="ตัวกรองสต็อก" className={styles.filters}>
        <ul className="chips">
          {FILTERS.map((item) => (
            <li key={item.value}>
              <Link
                href={stockHref(item.value)}
                className={item.value === filter ? `chip ${styles.chipActive}` : "chip"}
                aria-current={item.value === filter ? "page" : undefined}
              >
                {`${item.label} ${formatNumber(list.counts[item.value])}`}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {list.rows.length === 0 ? (
        <EmptyState title={`ไม่มีสินค้าที่${current.label}`} />
      ) : (
        <ul className={styles.rows}>
          {list.rows.map((row) => (
            <StockRowItem key={row.variantId} row={row} />
          ))}
        </ul>
      )}
      <Pager page={list.page} pageCount={list.pageCount} href={(page) => stockHref(filter, page)} />
    </>
  );
}
