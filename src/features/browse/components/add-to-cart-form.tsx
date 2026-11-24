"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { ACTION_FAILED } from "@/features/account/components/action-form";
import type { AddToCart, AddToCartResult } from "@/features/browse/add-to-cart";
import type { ProductDetail } from "@/features/browse/server/product-detail";
import { settle } from "@/features/cart/components/settle";
import { formatBaht } from "@/shared/format";
import {
  blockedReason,
  findVariant,
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
  addToCart: AddToCart;
};

/** ราคา ตัวเลือก สต็อก จำนวน และปุ่ม "ใส่ตะกร้า" ของหน้ารายละเอียดสินค้า (BRW-008 ถึง BRW-010) */
export function AddToCartForm({ product, signedIn, isOwnShop, loginHref, addToCart }: Props) {
  const [selection, setSelection] = useState<Selection>(() => product.options.map(() => null));
  const [quantity, setQuantity] = useState("1");
  const [result, setResult] = useState<AddToCartResult | null>(null);
  const [pending, startTransition] = useTransition();

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
    startTransition(async () =>
      setResult((await settle(addToCart({ variantId: variant.id, quantity }))) ?? { ok: false, message: ACTION_FAILED }),
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <p className={styles.bigPrice}>{priceText(variant ? [variant] : product.variants)}</p>

      {product.options.map((option, optionIndex) => (
        <fieldset key={option.id} className={styles.option}>
          <legend>{option.name}</legend>
          <div className="chips">
            {option.values.map((value) => (
              <label key={value.id} className={`chip ${styles.choice}`}>
                <input
                  type="radio"
                  name={`option-${option.id}`}
                  checked={selection[optionIndex] === value.id}
                  onChange={() => choose(optionIndex, value.id)}
                />
                {value.value}
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      {product.options.length > 0 && (
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
      )}

      {complete && (
        <p className={variant && variant.stock > 0 ? undefined : styles.soldOut}>{stockText(variant?.stock ?? 0)}</p>
      )}

      <label className="field">
        จำนวน
        <input
          className={`input ${styles.quantity}`}
          type="number"
          inputMode="numeric"
          min={1}
          name="quantity"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
        />
      </label>

      {signedIn || blocked ? (
        <button type="submit" className="button" disabled={blocked !== null || pending}>
          ใส่ตะกร้า
        </button>
      ) : (
        <Link href={loginHref} className="button">
          ใส่ตะกร้า
        </Link>
      )}

      {isOwnShop && <p className="field-error">{blocked}</p>}
      {result && (
        <p role={result.ok ? "status" : "alert"} className={result.ok ? undefined : "field-error"}>
          {result.message}
        </p>
      )}
      {result?.message === ACTION_FAILED && (
        <button type="submit" className="button button-secondary" disabled={pending}>
          ลองใหม่
        </button>
      )}
    </form>
  );
}
