"use client";

import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { useState, useTransition } from "react";
import { loadMoreOrdersAction } from "@/features/checkout/buyer-order-actions";
import type { BuyerOrderPage, BuyerOrderSummary, OrderCursor, OrderFilter } from "@/features/checkout/server/buyer-orders";
import { AwaitingReviewBadge } from "@/features/review/components/rating";
import { formatBaht, formatThaiDateTime, formatNumber } from "@/shared/format";
import { ORDER_STATUS } from "@/shared/statuses";
import { Journey, ORDER_JOURNEY } from "@/shared/ui/journey";
import { StatusBadge } from "@/shared/ui/status-badge";
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

export function OrderList({ initial, status }: { initial: OrderListState; status: OrderFilter | null }) {
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

/** สถานะคือสิ่งที่ผู้ซื้อมาหา จึงเป็นบรรทัดแรกที่ใหญ่ที่สุดของแถว */
function OrderCard({ order }: { order: BuyerOrderSummary }) {
  return (
    <li className={styles.order}>
      <Link href={`/orders/${order.orderNo}`} className={styles.cardLink}>
        {order.firstItemCover ? (
          <img src={order.firstItemCover} alt="" className={styles.thumb} loading="lazy" />
        ) : (
          <span className={styles.thumb} />
        )}
        <span className={styles.cardText}>
          <span className={styles.status}>
            <StatusBadge status={order.status} />
            {order.status !== ORDER_STATUS.cancelled && (
              <Journey
                compact
                steps={ORDER_JOURNEY}
                current={ORDER_JOURNEY.indexOf(order.status)}
                label={`ขั้นที่ ${ORDER_JOURNEY.indexOf(order.status) + 1} จาก ${ORDER_JOURNEY.length}`}
              />
            )}
          </span>
          <AwaitingReviewBadge count={order.awaitingReview} />
          <span className={styles.itemName}>{order.firstItemName}</span>
          <span className={styles.muted}>
            {order.shopName} · รวม {formatNumber(order.itemCount)} ชิ้น
          </span>
          <span className={styles.muted}>สั่งเมื่อ {formatThaiDateTime(order.orderedAt)}</span>
        </span>
        <span className={styles.total}>{formatBaht(order.total)}</span>
      </Link>
      {order.payable && (
        <div className={styles.rowAction}>
          <span className={styles.deadline}>จ่ายภายใน {formatThaiDateTime(order.paymentDeadline)}</span>
          {/* หน้ารายการมีได้หลายคำสั่งซื้อที่รอจ่าย ปุ่มจึงเป็นปุ่มรอง */}
          <PayButton orderNo={order.orderNo} groupId={order.groupId} secondary />
        </div>
      )}
      {order.status === ORDER_STATUS.shipping && order.trackingNo && (
        <div className={styles.rowAction}>
          <Link href={`/track/${order.trackingNo}`} className="link-action">
            ติดตามพัสดุ
          </Link>
        </div>
      )}
    </li>
  );
}
