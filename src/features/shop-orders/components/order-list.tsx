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

/**
 * หน้ารายการคำสั่งซื้อของร้าน (ORD-001 ถึง ORD-003 ORD-009 ORD-010)
 * ตัวกรองทั้งหมดมีบรรทัด "รอจัดของ N รายการ" เหนือรายการ กดแล้วไปตัวกรองจ่ายแล้ว
 */
export function OrderListView({ params, counts, list, version }: Props) {
  const { status, q } = params;
  const current = { status, q, page: list.page, asOf: list.asOf };
  const awaitingPacking = !status && !q ? counts[ORDER_STATUS.paid] : 0;
  return (
    <>
      <h1>คำสั่งซื้อ</h1>
      <LiveUpdates version={version} asOf={list.asOf} />

      <div className={styles.toolbar}>
        <ul className={`chips ${styles.chips}`} aria-label="กรองตามสถานะ">
          {FILTERS.map(([key, label]) => {
            const active = !q && status === key;
            return (
              <li key={label}>
                <Link href={ordersHref({ status: key })} className={`chip ${styles.chipLink}`} aria-current={active ? "page" : undefined}>
                  {label} ({formatNumber(key ? counts[ORDER_STATUS[key]] : counts.all)})
                </Link>
              </li>
            );
          })}
        </ul>
        <SearchForm key={q} q={q} status={status} error={params.queryError} />
      </div>

      {list.newCount > 0 && (
        <Link href={ordersHref({ status, q })} className={styles.newOrders}>
          มีคำสั่งซื้อใหม่ {formatNumber(list.newCount)} รายการ กดเพื่อแสดง
        </Link>
      )}

      {q && (
        <p className={styles.searchResult}>
          ผลการค้นหาเลข &quot;{q}&quot;
          <Link href={ordersHref({ status })} className="link-action">
            ล้างคำค้น
          </Link>
        </p>
      )}

      {awaitingPacking > 0 && (
        <p className={styles.searchResult}>
          <Link href={ordersHref({ status: "paid" })} className="link-action">
            รอจัดของ {formatNumber(awaitingPacking)} รายการ
          </Link>
        </p>
      )}

      <Results params={params} list={list} current={current} />
    </>
  );
}

function Results({ params, list, current }: Pick<Props, "params" | "list"> & { current: ListParams }) {
  if (list.total === 0) {
    if (params.q) return <EmptyState title={`ไม่พบคำสั่งซื้อเลข ${params.q} ในร้านของคุณ`} />;
    if (params.status) return <EmptyState title={`ไม่มีคำสั่งซื้อในสถานะ ${ORDER_STATUS[params.status]}`} />;
    return <EmptyState title="ร้านยังไม่มีคำสั่งซื้อ" message="คำสั่งซื้อจะขึ้นที่นี่เมื่อผู้ซื้อสั่งสินค้าของร้าน" />;
  }

  return (
    <section aria-label="รายการคำสั่งซื้อ">
      <OrderTable rows={list.items} current={current} />
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

/** ทั้งแถวกดไปหน้ารายละเอียด ปุ่มจัดส่งและลิงก์ดูการจัดส่งอยู่เหนือลิงก์ของแถว */
function OrderTable({ rows, current }: { rows: OrderList["items"]; current: ListParams }) {
  return (
    <div className={styles.table}>
      <div className={styles.head} aria-hidden="true">
        <span>เลขคำสั่งซื้อ</span>
        <span>สถานะ</span>
        <span>สั่งซื้อเมื่อ</span>
        <span>ผู้รับ</span>
        <span className={styles.end}>ยอดรวม</span>
      </div>
      <ul className={styles.list}>
        {rows.map((row) => (
          <li key={row.orderNo} className={styles.row}>
            <Link href={orderHref(row.orderNo, current)} className={styles.rowLink}>
              {row.orderNo}
            </Link>
            <span className={styles.status}>{row.status}</span>
            <span className={styles.when}>
              <span className={styles.cellLabel}>สั่งซื้อเมื่อ </span>
              <time dateTime={row.orderedAt}>{formatThaiDateTime(row.orderedAt)}</time>
            </span>
            <span className={styles.recipient}>
              <span className={styles.cellLabel}>ผู้รับ </span>
              {row.recipientName}
            </span>
            <span className={styles.total}>
              {formatNumber(row.itemCount)} ชิ้น · <span className={styles.cellLabel}>ยอดรวม </span>
              {formatBaht(row.total)}
            </span>
            <ShippingActions orderNo={row.orderNo} status={row.status} trackingNo={row.trackingNo} secondary />
          </li>
        ))}
      </ul>
    </div>
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
