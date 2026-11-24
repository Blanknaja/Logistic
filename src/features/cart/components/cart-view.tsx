"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ACTION_FAILED } from "@/shared/ui/action-form";
import { settle } from "@/shared/ui/timeout";
import {
  changeQuantityAction,
  checkoutAction,
  removeItemAction,
  selectItemsAction,
  type CartActionResult,
} from "@/features/cart/actions";
import type { Cart, CartItem } from "@/features/cart/server/cart";
import { formatBaht, formatNumber } from "@/shared/format";
import { LoadingTimeout } from "@/shared/ui/loading-timeout";
import styles from "./cart.module.css";

type Message = { itemId: number | null; text: string };

const allItems = (cart: Cart) => cart.shops.flatMap((shop) => shop.items);
const buyable = (items: CartItem[]) => items.filter((item) => !item.unavailable);
const allSelected = (items: CartItem[]) => buyable(items).length > 0 && buyable(items).every((item) => item.selected);

/** หน้าตะกร้าที่มีรายการ ทุกการเปลี่ยนส่งไปบันทึกแล้วหน้าโหลดตะกร้าล่าสุดจากเซิร์ฟเวอร์ */
export function CartView({ cart }: { cart: Cart }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<Message | null>(null);
  const [retry, setRetry] = useState<(() => void) | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  // เปลี่ยนทุกครั้งที่ได้ผล ช่องจำนวนที่พิมพ์ค้างไว้จะกลับไปเป็นค่าที่บันทึกจริง
  const [version, setVersion] = useState(0);

  function run(operation: () => Promise<CartActionResult>, itemId: number | null = null) {
    setMessage(null);
    setRetry(null);
    startTransition(async () => {
      const result = await settle(operation());
      if ("failed" in result) setRetry(() => () => run(operation, itemId));
      else if (result.message) setMessage({ itemId, text: result.message });
      setVersion((v) => v + 1);
    });
  }

  const select = (items: CartItem[], selected: boolean) =>
    run(() => selectItemsAction(buyable(items).map((item) => item.id), selected));

  const checkout = () =>
    run(() =>
      checkoutAction(
        allItems(cart)
          .filter((item) => item.selected)
          .map((item) => ({ itemId: item.id, price: item.price, quantity: item.quantity })),
      ),
    );

  return (
    <>
      {message?.itemId === null && (
        <p role="alert" className="field-error">
          {message.text}
        </p>
      )}
      {cart.shops.map((shop) => (
        <section key={shop.id} className={`card ${styles.shop}`} aria-label={shop.name}>
          <header className={styles.shopHeader}>
            <label className={styles.check}>
              <input
                type="checkbox"
                aria-label={`เลือกทั้งร้าน ${shop.name}`}
                checked={allSelected(shop.items)}
                disabled={pending || buyable(shop.items).length === 0}
                onChange={(event) => select(shop.items, event.target.checked)}
              />
            </label>
            <Link href={`/shops/${shop.id}`}>{shop.name}</Link>
            <span className={styles.shopTotal}>ยอดของร้าน {pending ? "กำลังคิด…" : formatBaht(shop.total)}</span>
          </header>
          <ul className={styles.items}>
            {shop.items.map((item) => (
              <CartLine
                key={`${item.id}:${item.quantity}:${version}`}
                item={item}
                pending={pending}
                message={message?.itemId === item.id ? message.text : null}
                onSelect={(selected) => select([item], selected)}
                onQuantity={(quantity) => run(() => changeQuantityAction(item.id, quantity), item.id)}
                onRemove={() => setRemoving(item.id)}
              />
            ))}
          </ul>
        </section>
      ))}
      <CartSummary
        cart={cart}
        pending={pending}
        allSelected={allSelected(allItems(cart))}
        onSelectAll={(selected) => select(allItems(cart), selected)}
        onCheckout={checkout}
        onRetry={retry}
      />
      {removing !== null && (
        <ConfirmRemove
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            const itemId = removing;
            setRemoving(null);
            run(() => removeItemAction(itemId), itemId);
          }}
        />
      )}
    </>
  );
}

export function CartLine({
  item,
  pending,
  message,
  onSelect,
  onQuantity,
  onRemove,
}: {
  item: CartItem;
  pending: boolean;
  message: string | null;
  onSelect: (selected: boolean) => void;
  onQuantity: (quantity: string) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState(String(item.quantity));
  const locked = pending || item.unavailable !== null;
  const commit = () => {
    if (draft.trim() !== String(item.quantity)) onQuantity(draft);
  };

  return (
    <li className={item.unavailable ? `${styles.item} ${styles.faded}` : styles.item}>
      <label className={styles.check}>
        <input
          type="checkbox"
          aria-label={`เลือก ${item.name}`}
          checked={item.selected}
          disabled={locked}
          onChange={(event) => onSelect(event.target.checked)}
        />
      </label>
      {item.imageUrl ? (
        <img src={item.imageUrl} alt="" className={styles.thumb} loading="lazy" />
      ) : (
        <div className={styles.thumb}>ไม่มีรูป</div>
      )}
      <div className={styles.details}>
        <p className={styles.name} title={item.name}>
          <Link href={`/products/${item.productId}`}>{item.name}</Link>
        </p>
        {item.variantLabel && <p className={styles.muted}>{item.variantLabel}</p>}
        <p className={styles.muted}>{formatBaht(item.price)} ต่อชิ้น</p>
        {item.priceChangedFrom !== null && (
          <p className={styles.warning}>
            ราคาเปลี่ยนจาก {formatBaht(item.priceChangedFrom)} เป็น {formatBaht(item.price)}
          </p>
        )}
        {item.unavailable && <p className={styles.reason}>{item.unavailable}</p>}
        {item.notice && <p className={styles.warning}>{item.notice}</p>}
      </div>
      <div className={styles.controls}>
        <div className={styles.stepper}>
          <button
            type="button"
            aria-label="ลดจำนวน"
            disabled={locked || item.quantity <= 1}
            onClick={() => onQuantity(String(item.quantity - 1))}
          >
            −
          </button>
          <input
            aria-label={`จำนวน ${item.name}`}
            inputMode="numeric"
            value={draft}
            disabled={locked}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit();
            }}
          />
          <button
            type="button"
            aria-label="เพิ่มจำนวน"
            disabled={locked || item.quantity >= item.stock}
            onClick={() => onQuantity(String(item.quantity + 1))}
          >
            +
          </button>
        </div>
        <span className={styles.lineTotal}>{item.unavailable ? null : formatBaht(item.lineTotal)}</span>
        <button type="button" className={styles.remove} disabled={pending} onClick={onRemove}>
          ลบ
        </button>
      </div>
      {message && (
        <p role="alert" className={`field-error ${styles.message}`}>
          {message}
        </p>
      )}
    </li>
  );
}

/** แถบยอดรวมติดขอบล่างจอ ระหว่างรอผลไม่แสดงยอดเก่าและกดสั่งซื้อไม่ได้ (CRT-012 CRT-Q02) */
export function CartSummary({
  cart,
  pending,
  allSelected,
  onSelectAll,
  onCheckout,
  onRetry,
}: {
  cart: Cart;
  pending: boolean;
  allSelected: boolean;
  onSelectAll: (selected: boolean) => void;
  onCheckout: () => void;
  onRetry: (() => void) | null;
}) {
  return (
    <div className={styles.summary}>
      {onRetry && (
        <div role="alert">
          <span className="field-error">{ACTION_FAILED}</span>
          <button type="button" className="button button-secondary" disabled={pending} onClick={onRetry}>
            ลองใหม่
          </button>
        </div>
      )}
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={allSelected}
          disabled={pending}
          onChange={(event) => onSelectAll(event.target.checked)}
        />
        เลือกทั้งหมด
      </label>
      <div className={styles.totals} aria-live="polite">
        <div className={styles.grandTotal}>{pending ? "กำลังคิด…" : formatBaht(cart.total)}</div>
        <div className={styles.muted}>
          {pending ? "" : `${formatNumber(cart.pieces)} ชิ้น · `}ยังไม่รวมค่าส่ง
        </div>
      </div>
      <button type="button" className="button" disabled={pending || cart.pieces === 0} onClick={onCheckout}>
        สั่งซื้อ
      </button>
    </div>
  );
}

export function ConfirmRemove({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, []);
  return (
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="cart-remove-title" onCancel={onCancel}>
      <p id="cart-remove-title">ลบสินค้านี้ออกจากตะกร้า?</p>
      <div className={styles.dialogActions}>
        <button type="button" className="button button-secondary" onClick={onCancel}>
          ยกเลิก
        </button>
        <button type="button" className="button" onClick={onConfirm}>
          ยืนยัน
        </button>
      </div>
    </dialog>
  );
}

/** ข้อมูลตะกร้าไม่มาใน 10 วินาที เปลี่ยนโครงสีเทาเป็นข้อความผิดพลาด (CRT-008 CRT-009) */
export function CartLoading() {
  return (
    <LoadingTimeout title={ACTION_FAILED}>
      <CartSkeleton />
    </LoadingTimeout>
  );
}

/** โครงสีเทาระหว่างโหลดตะกร้า ไม่มีข้อความตะกร้าว่าง ยอดรวม หรือปุ่มสั่งซื้อ (CRT-008) */
export function CartSkeleton() {
  return (
    <div role="status" aria-label="กำลังโหลด">
      <div className={`${styles.skeleton} ${styles.skeletonShop}`} />
      <div className={`${styles.skeleton} ${styles.skeletonShop}`} />
      <div className={`${styles.skeleton} ${styles.skeletonBar}`} />
    </div>
  );
}
