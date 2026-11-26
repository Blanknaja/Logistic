"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { ACTION_FAILED } from "@/shared/ui/action-form";
import { flyToCart } from "@/shared/ui/fly-to-cart";
import { settle } from "@/shared/ui/timeout";
import type { AddToCart, AddToCartResult } from "@/features/browse/add-to-cart";
import type { ProductDetail } from "@/features/browse/server/product-detail";
import { formatBaht } from "@/shared/format";
import {
  blockedReason,
  findVariant,
  isValueSoldOut,
  missingOptionMessage,
  priceText,
  stockText,
  type Selection,
} from "./variant-selection";
import styles from "./browse.module.css";

type Props = {
  product: ProductDetail;
  signedIn: boolean;
  isOwnShop: boolean;
  /** หน้าเข้าสู่ระบบที่พากลับมาหน้าสินค้านี้ (BRW-014) */
  loginHref: string;
  /** ค่าส่งต่อหนึ่งคำสั่งซื้อ หนึ่งคำสั่งซื้อต่อร้าน (CHK-001) */
  shippingFee: number;
  addToCart: AddToCart;
};

/** ปุ่มบอกว่า "ใส่แล้ว" นานเท่านี้ แล้วกลับเป็น "ใส่ตะกร้า" ให้กดเพิ่มได้อีก */
const ADDED_MS = 1600;

/** ราคา ค่าส่ง ตัวเลือก สต็อก จำนวน และปุ่ม "ใส่ตะกร้า" ของหน้ารายละเอียดสินค้า (BRW-008 ถึง BRW-010) */
export function AddToCartForm({ product, signedIn, isOwnShop, loginHref, shippingFee, addToCart }: Props) {
  const [selection, setSelection] = useState<Selection>(() => product.options.map(() => null));
  const [quantity, setQuantity] = useState("1");
  const [result, setResult] = useState<AddToCartResult | null>(null);
  const [pending, startTransition] = useTransition();
  // ปุ่มตอบทันทีที่กด ไม่รอเซิร์ฟเวอร์ ถ้าเซิร์ฟเวอร์ตอบว่าไม่สำเร็จ ปุ่มกลับเป็นเดิมพร้อมข้อความ
  const [added, setAdded] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!added || pending) return;
    const timer = setTimeout(() => setAdded(false), ADDED_MS);
    return () => clearTimeout(timer);
  }, [added, pending]);

  const complete = missingOptionMessage(product.options, selection) === null;
  const variant = findVariant(product, selection);
  const blocked = blockedReason(product, selection, isOwnShop);

  function choose(optionIndex: number, valueId: number) {
    setSelection((current) => current.map((value, i) => (i === optionIndex ? valueId : value)));
    setResult(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const missing = missingOptionMessage(product.options, selection);
    if (missing) {
      setResult({ ok: false, message: missing });
      return;
    }
    if (!variant) return;
    setAdded(true);
    if (addButton.current) flyToCart(addButton.current, product.images[0] ?? null);
    startTransition(async () => {
      const result = await settle(addToCart({ variantId: variant.id, quantity }));
      const shown = "failed" in result ? { ok: false, message: ACTION_FAILED } : result;
      setResult(shown);
      if (!shown.ok) setAdded(false);
    });
  }

  return (
    <form onSubmit={submit} noValidate className={styles.purchase}>
      <div className={styles.priceBlock}>
        <p className={styles.bigPrice}>{priceText(variant ? [variant] : product.variants)}</p>
        <p className={styles.stock}>ค่าส่ง {formatBaht(shippingFee)} ต่อร้าน</p>
        {complete && (
          <p className={variant && variant.stock > 0 ? styles.stock : styles.soldOut}>{stockText(variant?.stock ?? 0)}</p>
        )}
      </div>

      <div className={styles.choose}>
        {product.options.map((option, optionIndex) => (
          <fieldset key={option.id} className={styles.option}>
            <legend>{option.name}</legend>
            <div className="chips">
              {option.values.map((value) => {
                const soldOut = isValueSoldOut(product, selection, optionIndex, value.id);
                return (
                  <label key={value.id} className={`chip ${styles.choice} ${soldOut ? styles.choiceSoldOut : ""}`}>
                    <input
                      type="radio"
                      name={`option-${option.id}`}
                      checked={selection[optionIndex] === value.id}
                      onChange={() => choose(optionIndex, value.id)}
                    />
                    {value.value}
                    {soldOut && <span className="visually-hidden"> สินค้าหมด</span>}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}

        <div className={styles.buyBar}>
          <div className={styles.actions}>
            <label className={styles.quantity}>
              จำนวน
              <input
                className="input"
                type="number"
                inputMode="numeric"
                min={1}
                name="quantity"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </label>
            {signedIn || blocked ? (
              <button ref={addButton} type="submit" className={added ? `button ${styles.added}` : "button"} disabled={blocked !== null || pending}>
                {added ? (
                  <>
                    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
                      <path className="draw" pathLength="1" d="m5 12.5 4.5 4.5L19 7.5" />
                    </svg>
                    ใส่แล้ว
                  </>
                ) : (
                  "ใส่ตะกร้า"
                )}
              </button>
            ) : (
              <Link href={loginHref} className="button">
                ใส่ตะกร้า
              </Link>
            )}
          </div>

          {isOwnShop && <p className="field-error">{blocked}</p>}
          {result && (
            <p role={result.ok ? "status" : "alert"} className={result.ok ? `badge badge-success ${styles.notice}` : "field-error"}>
              {result.message}
            </p>
          )}
          {result?.message === ACTION_FAILED && (
            <button type="submit" className="button button-secondary" disabled={pending}>
              ลองใหม่
            </button>
          )}
        </div>

        {product.options.length > 0 && (
          <details className={styles.variants}>
            <summary>สต็อกของแต่ละแบบย่อย</summary>
            <ul className={styles.variantList} aria-label="สต็อกของแต่ละแบบย่อย">
              {product.variants.map((v) => (
                <li key={v.id} className={v.stock > 0 ? undefined : styles.faded}>
                  <span>{v.label}</span>
                  <span>
                    {formatBaht(v.price)} · {stockText(v.stock)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </form>
  );
}
