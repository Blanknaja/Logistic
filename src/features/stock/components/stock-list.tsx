import Link from "next/link";
import { STOCK_LABEL } from "@/features/stock/server/labels";
import type { StockFilter, StockList } from "@/features/stock/server/stock";
import { formatNumber } from "@/shared/format";
import { EmptyState } from "@/shared/ui/states";
import { Pager } from "./pager";
import { StockRowItem, type Outcome } from "./stock-row";
import styles from "./stock.module.css";

const FILTERS: { value: StockFilter; label: string }[] = [
  { value: "all", label: "ทั้งหมด" },
  { value: "low", label: STOCK_LABEL.low },
  { value: "out", label: STOCK_LABEL.out },
];

const OUTCOMES: Outcome[] = ["saved", "invalid", "changed", "not-found"];

function stockHref(filter: StockFilter, page = 1): string {
  const query = new URLSearchParams();
  if (filter !== "all") query.set("filter", filter);
  if (page > 1) query.set("page", String(page));
  const text = query.toString();
  return text ? `/seller/stock?${text}` : "/seller/stock";
}

/** ผลบันทึกที่ส่งกลับมาทาง ?saved= และ ?outcome= เมื่อเบราว์เซอร์ไม่มี JavaScript ค่าที่ไม่รู้จักได้ null */
export function savedFlash(saved: unknown, outcome: unknown): { variantId: number; outcome: Outcome } | null {
  const variantId = Number(saved);
  return Number.isSafeInteger(variantId) && OUTCOMES.includes(outcome as Outcome) ? { variantId, outcome: outcome as Outcome } : null;
}

export function StockListView({
  list,
  filter,
  flash = null,
}: {
  list: StockList;
  filter: StockFilter;
  flash?: { variantId: number; outcome: Outcome } | null;
}) {
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
  const back = stockHref(filter, list.page);
  return (
    <>
      <h1>สต็อก</h1>
      <nav aria-label="ตัวกรองสต็อก" className={styles.filters}>
        <ul className="chips">
          {FILTERS.map((item) => (
            <li key={item.value}>
              <Link href={stockHref(item.value)} className={`chip ${styles.chip}`} aria-current={item.value === filter ? "page" : undefined}>
                {`${item.label} ${formatNumber(list.counts[item.value])}`}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {list.rows.length === 0 ? (
        <EmptyState title={`ไม่มีสินค้าที่${current.label}`} />
      ) : (
        <div className={styles.table}>
          <div className={styles.head} aria-hidden="true">
            <span className={styles.headName}>สินค้า</span>
            <span className={styles.headReserved}>จองอยู่</span>
            <span className={styles.headStock}>สต็อก</span>
          </div>
          <ul className={styles.rows} aria-label="สต็อกของแต่ละแบบย่อย">
            {list.rows.map((row) => (
              <StockRowItem
                key={row.variantId}
                row={row}
                back={back}
                outcome={flash?.variantId === row.variantId ? flash.outcome : null}
              />
            ))}
          </ul>
        </div>
      )}
      <Pager page={list.page} pageCount={list.pageCount} href={(page) => stockHref(filter, page)} />
    </>
  );
}
