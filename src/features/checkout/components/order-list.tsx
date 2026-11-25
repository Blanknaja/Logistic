"use client";

import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { useState, useTransition } from "react";
import { loadMoreOrdersAction } from "@/features/checkout/buyer-order-actions";
import type { BuyerOrderPage, BuyerOrderSummary, OrderCursor } from "@/features/checkout/server/buyer-orders";
import { formatBaht, formatDateTime, formatNumber } from "@/shared/format";
import type { OrderStatus } from "@/shared/statuses";
import styles from "./buyer-orders.module.css";
import { PayButton } from "./pay-button";

export type OrderListState = BuyerOrderPage & { failed: boolean };

/** โหลดหน้าถัดไปต่อท้าย ถ้าโหลดไม่สำเร็จ รายการที่โหลดแล้วยังอยู่ครบ (CHK-009) */
export async function loadMore(
  state: OrderListState,
  fetchPage: (after: OrderCursor) => Promise<BuyerOrderPage>,
): Promise<OrderListState> {
  if (!state.next) return state;
  try {
    const page = await fetchPage(state.next);
    return { orders: [...state.orders, ...page.orders], next: page.next, failed: false };
  } catch (error) {
    // เซสชันหมดอายุระหว่างนั้น ต้องปล่อยให้ Next.js พาไปหน้าเข้าสู่ระบบ
    unstable_rethrow(error);
    return { ...state, failed: true };
  }
}

export function OrderList({ initial, status }: { initial: OrderListState; status: OrderStatus | null }) {
  const [state, setState] = useState(initial);
  const [pending, startTransition] = useTransition();
  const more = () =>
    startTransition(async () => {
      const next = await loadMore(state, (after) => loadMoreOrdersAction(status, after));
      startTransition(() => setState(next));
    });

  return (
    <div>
      <ul className={styles.list}>
        {state.orders.map((order) => (
          <OrderCard key={order.id} order={order} />
        ))}
      </ul>
      {state.failed ? (
        <div role="alert" className={styles.failed}>
          <p>โหลดคำสั่งซื้อไม่สำเร็จ</p>
          <button type="button" className="button" onClick={more} disabled={pending}>
            ลองใหม่
          </button>
        </div>
      ) : (
        state.next && (
          <button type="button" className="button button-secondary" onClick={more} disabled={pending}>
            {pending ? "กำลังโหลด..." : "ดูเพิ่ม"}
          </button>
        )
      )}
    </div>
  );
}

function OrderCard({ order }: { order: BuyerOrderSummary }) {
  return (
    <li className={styles.order}>
      <Link href={`/orders/${order.orderNo}`} className={styles.cardLink}>
        <span className={styles.row}>
          <strong>{order.shopName}</strong>
          <span className={styles.status}>{order.status}</span>
        </span>
        <span>
          {order.firstItemName} · รวม {formatNumber(order.itemCount)} ชิ้น
        </span>
        <span className={styles.row}>
          <span className={styles.muted}>สั่งเมื่อ {formatDateTime(order.orderedAt)}</span>
          <strong>{formatBaht(order.total)}</strong>
        </span>
      </Link>
      {order.payable && (
        <div className={styles.payRow}>
          <span>จ่ายภายใน {formatDateTime(order.paymentDeadline)}</span>
          {/* หน้ารายการมีได้หลายคำสั่งซื้อที่รอจ่าย ปุ่มจึงเป็นปุ่มรอง */}
          <PayButton orderNo={order.orderNo} groupId={order.groupId} secondary />
        </div>
      )}
    </li>
  );
}
