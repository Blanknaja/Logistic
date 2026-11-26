import type { Metadata } from "next";
import Link from "next/link";
import { OrderList } from "@/features/checkout/components/order-list";
import {
  AWAITING_REVIEW,
  countOrdersAwaitingReview,
  listBuyerOrders,
  parseOrderStatus,
  type OrderFilter,
} from "@/features/checkout/server/buyer-orders";
import styles from "@/features/checkout/components/buyer-orders.module.css";
import { getDb } from "@/shared/db";
import { requireAccount } from "@/shared/session";
import { formatNumber } from "@/shared/format";
import { ORDER_STATUS } from "@/shared/statuses";
import { EmptyState } from "@/shared/ui/states";

export const metadata: Metadata = { title: "คำสั่งซื้อ" };

const FILTERS: { label: string; status: OrderFilter | null }[] = [
  { label: "ทั้งหมด", status: null },
  ...Object.values(ORDER_STATUS).map((status) => ({ label: status, status })),
];

const filterHref = (status: OrderFilter | null) => (status ? `/orders?status=${encodeURIComponent(status)}` : "/orders");

export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  const status = parseOrderStatus((await searchParams).status);
  const viewer = await requireAccount(filterHref(status));
  const db = getDb();
  const page = listBuyerOrders(db, viewer.id, { status });
  // ตัวกรองตัวที่ 7 ต่อจากสถานะของคำสั่งซื้อ พร้อมจำนวนคำสั่งซื้อที่ยังมีรายการรอรีวิว (REV-005)
  const filters: typeof FILTERS = [
    ...FILTERS,
    { label: `${AWAITING_REVIEW} ${formatNumber(countOrdersAwaitingReview(db, viewer.id))}`, status: AWAITING_REVIEW },
  ];

  // ยังไม่เคยสั่งซื้อ ตัวกรองไม่มีอะไรให้กรอง หัวเรื่องบอกคำตอบแล้วพาไปเลือกซื้อ
  if (!status && page.orders.length === 0) {
    return (
      <>
        <h1>ยังไม่มีคำสั่งซื้อ</h1>
        <Link href="/" className="button">
          ไปเลือกซื้อสินค้า
        </Link>
      </>
    );
  }

  return (
    <>
      <h1>คำสั่งซื้อ</h1>
      <nav aria-label="กรองตามสถานะ">
        <ul className={`chips ${styles.filters}`}>
          {filters.map((filter) => (
            <li key={filter.label}>
              <Link
                href={filterHref(filter.status)}
                className={`chip ${styles.chipLink}`}
                aria-current={filter.status === status ? "page" : undefined}
              >
                {filter.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {page.orders.length === 0 ? (
        <EmptyState title={status === AWAITING_REVIEW ? "ไม่มีรายการที่รอรีวิว" : "ไม่มีคำสั่งซื้อในสถานะนี้"} />
      ) : (
        <OrderList key={status ?? ""} initial={{ ...page, failed: false }} status={status} />
      )}
    </>
  );
}
