"use client";

import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { startTransition, useActionState, useEffect, useRef } from "react";
import type { Checkout, CheckoutAddress, PlaceOrderFailure } from "@/features/checkout/server/checkout";
import { formatBaht } from "@/shared/format";
import styles from "./place-order.module.css";

export const PLACE_ORDER_TIMEOUT_MS = 10_000;
export const PLACE_ORDER_FAILED = "สั่งซื้อไม่สำเร็จ กรุณาลองใหม่";

type Failed = { failed: true };
type State = PlaceOrderFailure | Failed | null;

/** ผลเป็น failed เมื่อเน็ตหลุด ระบบพัง หรือไม่ได้ผลใน 10 วินาที แทนการโยน error ทั้งหน้า (CHK-005 CHK-Q01) */
export function withTimeout(action: (formData: FormData) => Promise<PlaceOrderFailure>, ms = PLACE_ORDER_TIMEOUT_MS) {
  return async (_previous: State, formData: FormData): Promise<State> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const running = action(formData);
    // ถ้าหมดเวลาไปก่อน ผลที่มาทีหลังไม่มีใครรอแล้ว
    running.catch(() => {});
    try {
      return await Promise.race([
        running,
        new Promise<Failed>((resolve) => {
          timer = setTimeout(() => resolve({ failed: true }), ms);
        }),
      ]);
    } catch (error) {
      // redirect() ไปหน้าจ่ายเงินมาในรูป error ต้องปล่อยให้ Next.js พาไป
      unstable_rethrow(error);
      return { failed: true };
    } finally {
      clearTimeout(timer);
    }
  };
}

function fullAddress(address: CheckoutAddress): string {
  return `${address.address} ${address.subdistrict} ${address.district} ${address.province} ${address.postcode}`;
}

/** หน้าสั่งซื้อ: เลือกที่อยู่ ดูสินค้าแยกตามร้าน แล้วกด "สั่งซื้อ" (CHK-004 ถึง CHK-007) */
export function CheckoutForm({
  checkout,
  selectedAddressId,
  action,
}: {
  checkout: Checkout;
  /** ที่อยู่ที่เลือกไว้ให้ก่อน ปกติคือที่อยู่หลัก */
  selectedAddressId: number | undefined;
  action: (formData: FormData) => Promise<PlaceOrderFailure>;
}) {
  const [state, dispatch, pending] = useActionState(withTimeout(action), null);
  // pending จะเป็น true หลัง React วาดใหม่ ส่วนนี้กันการกดซ้ำที่มาก่อนนั้น
  const busy = useRef(false);
  useEffect(() => {
    if (!pending) busy.current = false;
  }, [pending]);

  const failure = state && "ok" in state ? state : null;
  const lines = checkout.shops.flatMap((shop) => shop.lines);
  const hasLineProblem = lines.some((line) => line.problem !== null);

  return (
    <form
      method="post"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy.current || !checkout.canOrder) return;
        busy.current = true;
        const formData = new FormData(event.currentTarget);
        startTransition(() => dispatch(formData));
      }}
    >
      <input type="hidden" name="orderKey" value={checkout.orderKey} />
      <input
        type="hidden"
        name="lines"
        value={JSON.stringify(
          lines.map((line) => ({ cartItemId: line.cartItemId, quantity: line.quantity, unitPrice: line.unitPrice ?? 0 })),
        )}
      />

      <section className={`card ${styles.section}`}>
        <h2>ที่อยู่จัดส่ง</h2>
        {checkout.addresses.length === 0 ? (
          <p>ยังไม่มีที่อยู่จัดส่ง</p>
        ) : (
          <fieldset className={styles.addresses}>
            <legend className={styles.hidden}>เลือกที่อยู่จัดส่ง</legend>
            {checkout.addresses.map((address) => (
              <label key={address.id} className={styles.address}>
                <input type="radio" name="addressId" value={address.id} defaultChecked={address.id === selectedAddressId} />
                <span>
                  <strong>{address.recipientName}</strong> {address.phone}
                  {address.isDefault && <span className={styles.badge}>ที่อยู่หลัก</span>}
                  <br />
                  {fullAddress(address)}
                </span>
              </label>
            ))}
          </fieldset>
        )}
        {failure?.addressProblem && (
          <p className="field-error" role="alert">
            {failure.addressProblem}
          </p>
        )}
        <Link href="/addresses/new?next=%2Fcheckout" className="button button-secondary">
          เพิ่มที่อยู่
        </Link>
      </section>

      {checkout.shops.map((shop) => (
        <section key={shop.shopId} className={`card ${styles.section}`}>
          <h2>{shop.shopName}</h2>
          <ul className={styles.lines}>
            {shop.lines.map((line) => {
              const problem = failure?.problems[line.cartItemId] ?? line.problem;
              return (
                <li key={line.cartItemId} className={styles.line}>
                  {line.coverImageUrl ? (
                    <img src={line.coverImageUrl} alt="" width={64} height={64} className={styles.image} />
                  ) : (
                    <span className={styles.image} />
                  )}
                  <div>
                    <div>{line.productName}</div>
                    {line.variantLabel && <div className={styles.muted}>{line.variantLabel}</div>}
                    <div>
                      {line.unitPrice === null ? "-" : formatBaht(line.unitPrice)} × {line.quantity}
                    </div>
                    {problem && (
                      <p className="field-error" role="alert">
                        {problem}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <dl className={styles.totals}>
            <dt>ค่าสินค้า</dt>
            <dd>{formatBaht(shop.itemsTotal)}</dd>
            <dt>ค่าส่ง</dt>
            <dd>{formatBaht(shop.shippingFee)}</dd>
            <dt>รวม</dt>
            <dd>{formatBaht(shop.total)}</dd>
          </dl>
        </section>
      ))}

      <section className={`card ${styles.section}`}>
        <dl className={styles.totals}>
          <dt>ยอดรวมที่ต้องจ่าย</dt>
          <dd className={styles.grandTotal}>{formatBaht(checkout.total)}</dd>
        </dl>
        {state && "failed" in state && (
          <p className="field-error" role="alert">
            {PLACE_ORDER_FAILED}
          </p>
        )}
        <div className={styles.actions}>
          <button type="submit" className="button" disabled={pending || !checkout.canOrder}>
            {pending ? "กำลังสั่งซื้อ" : "สั่งซื้อ"}
          </button>
          {hasLineProblem && (
            <Link href="/cart" className="button button-secondary">
              กลับไปตะกร้า
            </Link>
          )}
        </div>
      </section>
    </form>
  );
}
