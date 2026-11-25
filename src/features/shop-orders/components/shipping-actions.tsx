"use client";

import Link from "next/link";
import { useActionState } from "react";
import { openShippingAction } from "@/features/shop-orders/actions";
import { trackingHref } from "@/features/shop-orders/paths";
import { ORDER_STATUS, type OrderStatus } from "@/shared/statuses";
import styles from "./shop-orders.module.css";

/**
 * ปุ่ม "จัดส่ง" ของคำสั่งซื้อที่จ่ายแล้ว หรือลิงก์ "ดูการจัดส่ง" ของคำสั่งซื้อที่มีพัสดุในสถานะอื่น (ORD-009)
 * จัดส่งคืองานที่ต้องทำจึงเป็นปุ่ม ดูการจัดส่งแค่เปิดดูจึงเป็นลิงก์ข้อความ
 * ข้อความจากการกดยังค้างอยู่หลังหน้าโหลดสถานะใหม่แล้วปุ่มหายไป เพราะ component นี้ไม่ถูกถอดออก
 * secondary ใช้ในรายการ ซึ่งมีปุ่มจัดส่งหลายแถว สีเน้นจึงเหลือไว้ให้ปุ่มหลักปุ่มเดียวของหน้ารายละเอียด
 */
export function ShippingActions({
  orderNo,
  status,
  trackingNo,
  secondary = false,
}: {
  orderNo: string;
  status: OrderStatus;
  trackingNo: string | null;
  secondary?: boolean;
}) {
  const [state, formAction, pending] = useActionState(openShippingAction, null);
  const canShip = status === ORDER_STATUS.paid;
  if (!canShip && !trackingNo && !state) return null;

  return (
    <div className={styles.actions}>
      {canShip && (
        <form action={formAction}>
          <input type="hidden" name="orderNo" value={orderNo} />
          <button type="submit" className={secondary ? "button button-secondary" : `button ${styles.ship}`} disabled={pending}>
            จัดส่ง
          </button>
        </form>
      )}
      {!canShip && trackingNo && (
        <Link href={trackingHref(trackingNo)} className="link-action">
          ดูการจัดส่ง
        </Link>
      )}
      {state && (
        <p role="alert" className={`field-error ${styles.error}`}>
          {state.error}
        </p>
      )}
    </div>
  );
}
