import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShopLogo } from "@/features/shop/components/shop-logo";
import styles from "@/features/shop/components/shop.module.css";
import { requireShop } from "@/features/shop/require-shop";
import { countShopProducts, getShopSummary } from "@/features/shop/server/shops";
import { countOrdersAwaitingPacking, UNCOUNTED } from "@/features/shop-orders/server/orders";
import { getDb } from "@/shared/db";
import { formatNumber } from "@/shared/format";
import { RetryButton } from "@/shared/ui/retry-button";
import { EmptyState } from "@/shared/ui/states";

export const metadata: Metadata = { title: "หลังบ้านของร้าน" };

const NOTICES: Record<string, string> = { opened: "เปิดร้านสำเร็จ", "has-shop": "คุณมีร้านอยู่แล้ว" };

/** หน้าแรกของหลังบ้าน ทางเข้าไปหน้าอื่นอยู่ในเมนูหลังบ้านของ layout (SHP-006) */
export default async function SellerHomePage({ searchParams }: PageProps<"/seller">) {
  const viewer = await requireShop("/seller");
  const db = getDb();
  const shop = getShopSummary(db, viewer.shopId);
  if (!shop) notFound();
  const products = countShopProducts(db, shop.id);
  let awaitingPacking: number | null = null;
  try {
    awaitingPacking = countOrdersAwaitingPacking(db, shop.id);
  } catch (error) {
    // นับไม่ได้ ส่วนอื่นของหน้ายังต้องใช้ได้
    console.error(error);
  }
  const { notice } = await searchParams;
  const noticeText = typeof notice === "string" && Object.hasOwn(NOTICES, notice) ? NOTICES[notice] : null;

  return (
    <>
      {noticeText && (
        <p role="status" className={styles.notice}>
          {noticeText}
        </p>
      )}
      <div className={styles.identity}>
        <ShopLogo name={shop.name} logoUrl={shop.logoUrl} />
        <div>
          <h1>{shop.name}</h1>
          <p className={styles.muted}>สถานะร้าน {shop.status}</p>
        </div>
      </div>
      <dl className={styles.stats}>
        <div className={styles.stat}>
          <dt>สินค้าที่ขายอยู่</dt>
          <dd>{formatNumber(products.onSale)}</dd>
        </div>
        <div className={styles.stat}>
          <dt>คำสั่งซื้อที่รอร้านจัดของ</dt>
          <dd>{awaitingPacking === null ? UNCOUNTED : formatNumber(awaitingPacking)}</dd>
          {awaitingPacking === null && (
            <div className={styles.statError} role="alert">
              <span>โหลดไม่สำเร็จ</span>
              <RetryButton />
            </div>
          )}
        </div>
      </dl>
      {products.listed === 0 && (
        <EmptyState title="ร้านของคุณยังไม่มีสินค้า">
          <Link href="/seller/products/new" className="button">
            ลงสินค้าชิ้นแรก
          </Link>
        </EmptyState>
      )}
    </>
  );
}
