import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShopLogo } from "@/features/shop/components/shop-logo";
import styles from "@/features/shop/components/shop.module.css";
import { requireShop } from "@/features/shop/require-shop";
import { countShopProducts, getShopSummary } from "@/features/shop/server/shops";
import { ordersHref } from "@/features/shop-orders/paths";
import { countOrdersAwaitingPacking, UNCOUNTED } from "@/features/shop-orders/server/orders";
import { listStock } from "@/features/stock/server/stock";
import { getDb } from "@/shared/db";
import { formatNumber } from "@/shared/format";
import { RetryButton } from "@/shared/ui/retry-button";
import { EmptyState } from "@/shared/ui/states";

export const metadata: Metadata = { title: "หลังบ้านของร้าน" };

const NOTICES: Record<string, string> = { opened: "เปิดร้านสำเร็จ", "has-shop": "คุณมีร้านอยู่แล้ว" };

/** นับไม่ได้ได้ null ส่วนอื่นของหน้ายังต้องใช้ได้ (SHP-006) */
function countOrNull<T>(count: () => T): T | null {
  try {
    return count();
  } catch (error) {
    console.error(error);
    return null;
  }
}

/**
 * หน้าแรกของหลังบ้าน ตัวเลขที่ผู้ขายต้องทำต่อขึ้นก่อน แต่ละตัวพาไปรายการที่ใช้จัดการเรื่องนั้น
 * ทางเข้าอื่นอยู่ในเมนูหลังบ้านของ layout (SHP-006)
 */
export default async function SellerHomePage({ searchParams }: PageProps<"/seller">) {
  const viewer = await requireShop("/seller");
  const db = getDb();
  const shop = getShopSummary(db, viewer.shopId);
  if (!shop) notFound();
  const products = countShopProducts(db, shop.id);
  const stock = countOrNull(() => listStock(db, shop.id).counts);
  const numbers = [
    { label: "คำสั่งซื้อที่รอร้านจัดของ", href: ordersHref({ status: "paid" }), value: countOrNull(() => countOrdersAwaitingPacking(db, shop.id)) },
    { label: "สต็อกใกล้หมด", href: "/seller/stock?filter=low", value: stock?.low ?? null },
    { label: "สต็อกหมด", href: "/seller/stock?filter=out", value: stock?.out ?? null },
    { label: "สินค้าที่ขายอยู่", href: "/seller/products", value: products.onSale },
  ];
  const { notice } = await searchParams;
  const noticeText = typeof notice === "string" && Object.hasOwn(NOTICES, notice) ? NOTICES[notice] : null;

  return (
    <>
      {noticeText && (
        <p role="status" className={styles.notice}>
          {noticeText}
        </p>
      )}
      <header className={styles.identity}>
        <ShopLogo name={shop.name} logoUrl={shop.logoUrl} />
        <div>
          <h1>{shop.name}</h1>
          <p className={styles.meta}>สถานะร้าน {shop.status}</p>
        </div>
      </header>
      <dl className={styles.stats}>
        {numbers.map((number) => (
          <div key={number.label} className={styles.stat}>
            <dt>
              <Link href={number.href} className={styles.statLink}>
                {number.label}
              </Link>
            </dt>
            <dd>
              {number.value === null ? UNCOUNTED : formatNumber(number.value)}
              {number.value === null && (
                <span className={styles.statError} role="alert">
                  โหลดไม่สำเร็จ
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {/* ปุ่มเดียวโหลดทุกตัวเลขใหม่ หน้าจึงมีปุ่มสีเน้นไม่เกินหนึ่งปุ่ม */}
      {numbers.some((number) => number.value === null) && <RetryButton />}
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
