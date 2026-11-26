"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef } from "react";
import type { Checkout, CheckoutAddress, PlaceOrderFailure } from "@/features/checkout/server/checkout";
import { formatBaht, formatNumber } from "@/shared/format";
import { withTimeout, type Failed } from "@/shared/ui/timeout";
import styles from "./place-order.module.css";

export const PLACE_ORDER_FAILED = "สั่งซื้อไม่สำเร็จ กรุณาลองใหม่";

/** ผลเป็น failed เมื่อเน็ตหลุด ระบบพัง หรือไม่ได้ผลใน 10 วินาที (CHK-005 CHK-Q01) */
type State = PlaceOrderFailure | Failed | null;

function fullAddress(address: CheckoutAddress): string {
  return `${address.address} ${address.subdistrict} ${address.district} ${address.province} ${address.postcode}`;
}

const price = (unitPrice: number | null, quantity = 1) => (unitPrice === null ? "-" : formatBaht(unitPrice * quantity));

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
  const [state, dispatch, pending] = useActionState<State, FormData>(withTimeout(action), null);
  // pending จะเป็น true หลัง React วาดใหม่ ส่วนนี้กันการกดซ้ำที่มาก่อนนั้น
  const busy = useRef(false);
  useEffect(() => {
    if (!pending) busy.current = false;
  }, [pending]);

  const failure = state && "ok" in state ? state : null;
  const lines = checkout.shops.flatMap((shop) => shop.lines);
  const hasLineProblem = lines.some((line) => line.problem !== null);
  const pieces = lines.reduce((sum, line) => sum + line.quantity, 0);
  const itemsTotal = checkout.shops.reduce((sum, shop) => sum + shop.itemsTotal, 0);
  const shippingTotal = checkout.shops.reduce((sum, shop) => sum + shop.shippingFee, 0);

  return (
    <form
      method="post"
      className={styles.layout}
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

      <div>
        <section className={styles.section}>
          <h2>ที่อยู่จัดส่ง</h2>
          {checkout.addresses.length === 0 ? (
            <>
              <p>ยังไม่มีที่อยู่จัดส่ง</p>
              <Link href="/addresses/new?next=%2Fcheckout" className="button button-secondary">
                เพิ่มที่อยู่
              </Link>
            </>
          ) : (
            <>
              <fieldset className={styles.addresses}>
                <legend className="visually-hidden">เลือกที่อยู่จัดส่ง</legend>
                {checkout.addresses.map((address) => (
                  <label key={address.id} className={styles.address}>
                    <input
                      type="radio"
                      name="addressId"
                      value={address.id}
                      defaultChecked={address.id === selectedAddressId}
                      className="visually-hidden"
                    />
                    <span>
                      {address.recipientName} {address.phone}
                      {address.isDefault && <span className={styles.badge}>ที่อยู่หลัก</span>}
                    </span>
                    <span className={styles.muted}>{fullAddress(address)}</span>
                  </label>
                ))}
              </fieldset>
              <Link href="/addresses/new?next=%2Fcheckout" className="link-action">
                เพิ่มที่อยู่
              </Link>
            </>
          )}
          {failure?.addressProblem && (
            <p className="field-error" role="alert">
              {failure.addressProblem}
            </p>
          )}
        </section>

        <section className={styles.section}>
          <h2>สินค้า</h2>
          {checkout.shops.map((shop) => (
            <div key={shop.shopId} className={styles.shop}>
              <h3 className={styles.shopName}>{shop.shopName}</h3>
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
                        <p>{line.productName}</p>
                        {line.variantLabel && <p className={styles.muted}>{line.variantLabel}</p>}
                        {/* ชิ้นเดียว ราคาต่อชิ้นเท่ากับราคาของรายการ จึงบอกครั้งเดียว */}
                        {line.quantity > 1 && (
                          <p className={styles.muted}>
                            {price(line.unitPrice)} × {formatNumber(line.quantity)}
                          </p>
                        )}
                        {problem && (
                          <p className="field-error" role="alert">
                            {problem}
                          </p>
                        )}
                      </div>
                      <span>{price(line.unitPrice, line.quantity)}</span>
                    </li>
                  );
                })}
              </ul>
              {/* ร้านเดียว ยอดของร้านคือยอดรวมที่ต้องจ่าย จึงบอกที่สรุปยอดที่เดียว */}
              {checkout.shops.length > 1 && (
                <dl className={styles.shopTotals}>
                  <div>
                    <dt>ค่าส่ง</dt>
                    <dd>{formatBaht(shop.shippingFee)}</dd>
                  </div>
                  <div>
                    <dt>รวมร้านนี้</dt>
                    <dd>{formatBaht(shop.total)}</dd>
                  </div>
                </dl>
              )}
            </div>
          ))}
        </section>
      </div>

      <section className={styles.summary} aria-label="ยอดรวมที่ต้องจ่าย">
        <dl className={styles.totals}>
          <div className={styles.part}>
            <dt>ค่าสินค้า {formatNumber(pieces)} ชิ้น</dt>
            <dd>{formatBaht(itemsTotal)}</dd>
          </div>
          <div className={styles.part}>
            <dt>ค่าส่ง {formatNumber(checkout.shops.length)} ร้าน</dt>
            <dd>{formatBaht(shippingTotal)}</dd>
          </div>
          <div className={styles.grand}>
            <dt>ยอดรวมที่ต้องจ่าย</dt>
            <dd>{formatBaht(checkout.total)}</dd>
          </div>
        </dl>
        {(hasLineProblem || (state && "failed" in state)) && (
          <div className={styles.notes}>
            {state && "failed" in state && (
              <p className="field-error" role="alert">
                {PLACE_ORDER_FAILED}
              </p>
            )}
            {hasLineProblem && (
              <Link href="/cart" className="link-action">
                กลับไปตะกร้า
              </Link>
            )}
          </div>
        )}
        <button type="submit" className="button" disabled={pending || !checkout.canOrder}>
          {pending ? "กำลังสั่งซื้อ" : "สั่งซื้อ"}
        </button>
      </section>
    </form>
  );
}
