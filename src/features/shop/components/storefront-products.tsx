"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import browse from "@/features/browse/components/browse.module.css";
import { ProductImage } from "@/features/browse/components/product-image";
import type { StorefrontCursor, StorefrontPage } from "@/features/shop/server/storefront";
import { formatBaht } from "@/shared/format";
import { ACTION_TIMEOUT_MS, settle } from "@/shared/ui/timeout";
import styles from "./shop.module.css";

export type ShownProducts = StorefrontPage & { failed: boolean };

type Load = (after: StorefrontCursor) => Promise<StorefrontPage>;

/** ต่อสินค้าชุดถัดไปท้ายรายการ ถ้าโหลดไม่สำเร็จหรือเกิน 10 วินาที คงรายการเดิมไว้ (SHP-011 SHP-013) */
export async function showMore(shown: ShownProducts, load: Load, ms = ACTION_TIMEOUT_MS): Promise<ShownProducts> {
  if (!shown.next) return shown;
  const page = await settle(load(shown.next), ms);
  if ("failed" in page) return { ...shown, failed: true };
  return { items: [...shown.items, ...page.items], next: page.next, failed: false };
}

/** รายการสินค้าในหน้าร้าน แบบเดียวกับรายการสินค้าของ BRW-001 พร้อมปุ่ม "ดูเพิ่ม" */
export function StorefrontProducts({ first, loadMore }: { first: StorefrontPage; loadMore: Load }) {
  const [shown, setShown] = useState<ShownProducts>({ ...first, failed: false });
  const [pending, startTransition] = useTransition();
  const more = () =>
    startTransition(async () => {
      const next = await showMore(shown, loadMore);
      startTransition(() => setShown(next));
    });

  return (
    <>
      <ul className={browse.grid}>
        {shown.items.map((item) => (
          <li key={item.id}>
            <Link href={`/products/${item.id}`} className={browse.card}>
              <ProductImage src={item.coverUrl} alt="" />
              <span className={browse.cardBody}>
                <span className={browse.cardName}>{item.name}</span>
                <span className={browse.priceText}>{formatBaht(item.price)}</span>
                {item.soldOut && <span className={browse.soldOut}>สินค้าหมด</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {shown.next && (
        <div className={styles.more}>
          {shown.failed && <p role="alert">โหลดสินค้าเพิ่มไม่สำเร็จ</p>}
          <button type="button" className="button button-secondary" onClick={more} disabled={pending}>
            {pending ? "กำลังโหลด" : shown.failed ? "ลองใหม่" : "ดูเพิ่ม"}
          </button>
        </div>
      )}
    </>
  );
}
