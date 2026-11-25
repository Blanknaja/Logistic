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
import type { Cart, CartItem, CartShop } from "@/features/cart/server/cart";
import { formatBaht, formatNumber } from "@/shared/format";
import { LoadingTimeout } from "@/shared/ui/loading-timeout";
import styles from "./cart.module.css";

type Message = { itemId: number | null; text: string };

const allItems = (cart: Cart) => cart.shops.flatMap((shop) => shop.items);
const buyable = (items: CartItem[]) => items.filter((item) => !item.unavailable);
const allSelected = (items: CartItem[]) => buyable(items).length > 0 && buyable(items).every((item) => item.selected);
const hasSelection = (shop: CartShop) => shop.items.some((item) => item.selected);

/** หน้าตะกร้าที่มีรายการ ทุกการเปลี่ยนส่งไปบันทึกแล้วหน้าโหลดตะกร้าล่าสุดจากเซิร์ฟเวอร์ */
export function CartView({ cart, shippingFee }: { cart: Cart; shippingFee: number }) {
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

  // ช่องเลือกทั้งหมดและเลือกทั้งร้านแสดงเฉพาะตอนที่ไม่ซ้ำกับช่องเลือกของรายการ
  const items = allItems(cart);
  const shopsToBuy = cart.shops.filter((shop) => buyable(shop.items).length > 0).length;
  const shopsSelected = cart.shops.filter(hasSelection).length;

  return (
    <>
      <div className={styles.layout}>
        <div>
          {message?.itemId === null && (
            <p role="alert" className="field-error">
              {message.text}
            </p>
          )}
          {buyable(items).length > 1 && (
            <div className={styles.selectAll}>
              <Check
                label="เลือกทั้งหมด"
                checked={allSelected(items)}
                disabled={pending}
                onChange={(selected) => select(items, selected)}
              >
                เลือกทั้งหมด
              </Check>
            </div>
          )}
          {cart.shops.map((shop) => (
            <section key={shop.id} className={styles.shop} aria-label={shop.name}>
              <header className={styles.shopHeader}>
                {shopsToBuy > 1 && buyable(shop.items).length > 1 && (
                  <Check
                    label={`เลือกทั้งร้าน ${shop.name}`}
                    checked={allSelected(shop.items)}
                    disabled={pending}
                    onChange={(selected) => select(shop.items, selected)}
                  />
                )}
                <h2 className={styles.shopName}>
                  <Link href={`/shops/${shop.id}`}>{shop.name}</Link>
                </h2>
                {shopsSelected > 1 && shop.items.filter((item) => item.selected).length > 1 && (
                  <span className={styles.shopTotal}>ยอดของร้าน {pending ? "กำลังคิด…" : formatBaht(shop.total)}</span>
                )}
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
        </div>
        <CartSummary cart={cart} shippingFee={shippingFee} pending={pending} onCheckout={checkout} onRetry={retry} />
      </div>
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

/** ช่องเลือกที่เบากว่าของเบราว์เซอร์: กรอบบาง เลือกแล้วได้ขอบสีเน้นกับเครื่องหมายถูก */
function Check({
  label,
  checked,
  disabled,
  onChange,
  children,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
  children?: string;
}) {
  return (
    <label className={styles.check}>
      <input
        type="checkbox"
        aria-label={children ? undefined : label}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className={styles.box} aria-hidden="true" />
      {children}
    </label>
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
      <Check label={`เลือก ${item.name}`} checked={item.selected} disabled={locked} onChange={onSelect} />
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
        {/* ชิ้นเดียว ราคาต่อชิ้นเท่ากับราคารวมของรายการ จึงบอกครั้งเดียว */}
        {item.quantity > 1 && <p className={styles.muted}>{formatBaht(item.price)} ต่อชิ้น</p>}
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
        <button type="button" className={`link-action ${styles.remove}`} disabled={pending} onClick={onRemove}>
          ลบ
        </button>
        <span className={styles.lineTotal}>{item.unavailable ? null : formatBaht(item.lineTotal)}</span>
      </div>
      {message && (
        <p role="alert" className={`field-error ${styles.message}`}>
          {message}
        </p>
      )}
    </li>
  );
}

/**
 * ค่าสินค้า ค่าส่ง ยอดรวมที่ต้องจ่าย และปุ่มสั่งซื้อ จอแคบติดขอบล่างจอ จอกว้างติดอยู่คอลัมน์ขวา
 * ค่าส่งคิดร้านละ shippingFee เฉพาะร้านที่มีรายการเลือกไว้ เพราะหน้าสั่งซื้อสร้างหนึ่งคำสั่งซื้อต่อร้าน (CHK-004)
 * ระหว่างรอผลไม่แสดงยอดเก่าและกดสั่งซื้อไม่ได้ (CRT-012 CRT-Q02)
 */
export function CartSummary({
  cart,
  shippingFee,
  pending,
  onCheckout,
  onRetry,
}: {
  cart: Cart;
  shippingFee: number;
  pending: boolean;
  onCheckout: () => void;
  onRetry: (() => void) | null;
}) {
  const shops = cart.shops.filter(hasSelection).length;
  const fee = shops * shippingFee;
  return (
    <div className={styles.summary}>
      {onRetry && (
        <div role="alert" className={styles.retry}>
          <span className="field-error">{ACTION_FAILED}</span>
          <button type="button" className="button button-secondary" disabled={pending} onClick={onRetry}>
            ลองใหม่
          </button>
        </div>
      )}
      <dl className={styles.totals} aria-live="polite">
        {!pending && cart.pieces > 0 && (
          <>
            <div className={styles.part}>
              <dt>ค่าสินค้า {formatNumber(cart.pieces)} ชิ้น</dt>
              <dd>{formatBaht(cart.total)}</dd>
            </div>
            <div className={styles.part}>
              <dt>ค่าส่ง {formatNumber(shops)} ร้าน</dt>
              <dd>{formatBaht(fee)}</dd>
            </div>
          </>
        )}
        <div className={styles.grand}>
          <dt>ยอดรวมที่ต้องจ่าย</dt>
          <dd>{pending ? "กำลังคิด…" : formatBaht(cart.total + fee)}</dd>
        </div>
      </dl>
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
