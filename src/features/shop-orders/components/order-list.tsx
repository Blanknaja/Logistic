import Link from "next/link";
import { orderHref, ordersHref, type ListParams, type StatusKey } from "@/features/shop-orders/paths";
import type { OrderList, StatusCounts } from "@/features/shop-orders/server/orders";
import { formatBaht, formatThaiDateTime, formatNumber } from "@/shared/format";
import { ORDER_STATUS } from "@/shared/statuses";
import { EmptyState } from "@/shared/ui/states";
import { LiveUpdates } from "./live-updates";
import { SearchForm } from "./search-form";
import { ShippingActions } from "./shipping-actions";
import styles from "./shop-orders.module.css";

type Props = {
  params: ListParams & { queryError: string | null };
  counts: StatusCounts;
  list: OrderList;
  version: string;
};

const FILTERS: [StatusKey | null, string][] = [[null, "ทั้งหมด"], ...(Object.entries(ORDER_STATUS) as [StatusKey, string][])];

/** หน้ารายการคำสั่งซื้อของร้าน (ORD-001 ถึง ORD-003 ORD-009 ORD-010) */
export function OrderListView({ params, counts, list, version }: Props) {
  const { status, q } = params;
  return (
    <>
      <h1>คำสั่งซื้อ</h1>
      <LiveUpdates version={version} asOf={list.asOf} />
      <SearchForm key={q} q={q} status={status} error={params.queryError} />

      <ul className="chips" aria-label="กรองตามสถานะ">
        {FILTERS.map(([key, label]) => {
          const active = !q && status === key;
          return (
            <li key={label}>
              <Link
                href={ordersHref({ status: key })}
                className={`chip ${styles.chipLink} ${active ? styles.chipActive : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {label} ({formatNumber(key ? counts[ORDER_STATUS[key]] : counts.all)})
              </Link>
            </li>
          );
        })}
      </ul>

      {list.newCount > 0 && (
        <Link href={ordersHref({ status, q })} className={styles.newOrders}>
          มีคำสั่งซื้อใหม่ {formatNumber(list.newCount)} รายการ กดเพื่อแสดง
        </Link>
      )}

      {q && (
        <p className={styles.actions}>
          ผลการค้นหาเลข &quot;{q}&quot;
          <Link href={ordersHref({ status })} className="button button-secondary">
            ล้างคำค้น
          </Link>
        </p>
      )}

      <Results params={params} list={list} />
    </>
  );
}

function Results({ params, list }: Pick<Props, "params" | "list">) {
  if (list.total === 0) {
    if (params.q) return <EmptyState title={`ไม่พบคำสั่งซื้อเลข ${params.q} ในร้านของคุณ`} />;
    if (params.status) return <EmptyState title={`ไม่มีคำสั่งซื้อในสถานะ ${ORDER_STATUS[params.status]}`} />;
    return <EmptyState title="ร้านยังไม่มีคำสั่งซื้อ" />;
  }

  const current = { status: params.status, q: params.q, page: list.page, asOf: list.asOf };
  return (
    <section aria-label="รายการคำสั่งซื้อ">
      <ul className={styles.list}>
        {list.items.map((row) => (
          <li key={row.orderNo} className={styles.row}>
            <Link href={orderHref(row.orderNo, current)} className={styles.rowLink}>
              <span className={styles.rowTop}>
                <span className={styles.orderNo}>{row.orderNo}</span>
                <span className={styles.status}>{row.status}</span>
              </span>
              <span className={styles.muted}>สั่งซื้อเมื่อ {formatThaiDateTime(row.orderedAt)}</span>
              <span>ผู้รับ {row.recipientName}</span>
              <span className={styles.total}>
                {formatNumber(row.itemCount)} ชิ้น · ยอดรวม {formatBaht(row.total)}
              </span>
            </Link>
            <ShippingActions orderNo={row.orderNo} status={row.status} trackingNo={row.trackingNo} secondary />
          </li>
        ))}
      </ul>
      {list.totalPages > 1 && (
        <nav aria-label="เปลี่ยนหน้า" className={styles.pagination}>
          <PageLink current={current} page={list.page - 1} totalPages={list.totalPages} label="หน้าก่อนหน้า" />
          <span>
            หน้า {formatNumber(list.page)} จาก {formatNumber(list.totalPages)}
          </span>
          <PageLink current={current} page={list.page + 1} totalPages={list.totalPages} label="หน้าถัดไป" />
        </nav>
      )}
    </section>
  );
}

function PageLink({ current, page, totalPages, label }: { current: ListParams; page: number; totalPages: number; label: string }) {
  if (page < 1 || page > totalPages) {
    return (
      <button type="button" className="button button-secondary" disabled>
        {label}
      </button>
    );
  }
  return (
    <Link href={ordersHref({ ...current, page })} className="button button-secondary">
      {label}
    </Link>
  );
}
