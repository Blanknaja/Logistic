import type { Metadata } from "next";
import Link from "next/link";
import { OrderList } from "@/features/checkout/components/order-list";
import { listBuyerOrders, parseOrderStatus } from "@/features/checkout/server/buyer-orders";
import styles from "@/features/checkout/components/buyer-orders.module.css";
import { getDb } from "@/shared/db";
import { requireAccount } from "@/shared/session";
import { ORDER_STATUS, type OrderStatus } from "@/shared/statuses";
import { EmptyState } from "@/shared/ui/states";

export const metadata: Metadata = { title: "คำสั่งซื้อ" };

const FILTERS: { label: string; status: OrderStatus | null }[] = [
  { label: "ทั้งหมด", status: null },
  ...Object.values(ORDER_STATUS).map((status) => ({ label: status, status })),
];

const filterHref = (status: OrderStatus | null) => (status ? `/orders?status=${encodeURIComponent(status)}` : "/orders");

export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  const status = parseOrderStatus((await searchParams).status);
  const viewer = await requireAccount(filterHref(status));
  const page = listBuyerOrders(getDb(), viewer.id, { status });

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
          {FILTERS.map((filter) => (
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
        <EmptyState title="ไม่มีคำสั่งซื้อในสถานะนี้" />
      ) : (
        <OrderList key={status ?? ""} initial={{ ...page, failed: false }} status={status} />
      )}
    </>
  );
}
