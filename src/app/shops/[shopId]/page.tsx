import Link from "next/link";
import { notFound } from "next/navigation";
import { ShopRatingLine } from "@/features/review/components/rating";
import { shopRating } from "@/features/review/server/ratings";
import { loadMoreShopProductsAction } from "@/features/shop/actions";
import { ShopLogo } from "@/features/shop/components/shop-logo";
import styles from "@/features/shop/components/shop.module.css";
import { StorefrontProducts } from "@/features/shop/components/storefront-products";
import { getStorefront, listStorefrontProducts } from "@/features/shop/server/storefront";
import { getDb } from "@/shared/db";
import { formatThaiDate, formatNumber } from "@/shared/format";
import { getCurrentAccount } from "@/shared/session";
import { SHOP_STATUS } from "@/shared/statuses";
import { EmptyState } from "@/shared/ui/states";
import { StatusBadge } from "@/shared/ui/status-badge";
import { PageReveal } from "@/shared/ui/transitions";

/** หน้าร้านที่ทุกคนเปิดดูได้ ข้อมูลร้านสั้นๆ แล้วสินค้าเริ่มในจอแรก (SHP-011 SHP-012 SHP-014) */
export default async function StorefrontPage({ params }: PageProps<"/shops/[shopId]">) {
  const { shopId } = await params;
  const db = getDb();
  const shop = /^\d+$/.test(shopId) ? getStorefront(db, Number(shopId)) : null;
  if (!shop) notFound();
  const viewer = await getCurrentAccount();
  const isOwner = viewer?.shopId === shop.id;
  const otherShops = (
    <Link href="/" className="button">
      ดูสินค้าจากร้านอื่น
    </Link>
  );

  if (shop.status === SHOP_STATUS.suspended) {
    return (
      <PageReveal>
        <>
          <header className={`card ${styles.identity}`}>
            <ShopLogo name={shop.name} logoUrl={shop.logoUrl} />
            <div>
              <h1>{shop.name}</h1>
              <StatusBadge status={shop.status} />
            </div>
          </header>
          <EmptyState art="shop" title="ร้านนี้ถูกระงับ ซื้อสินค้าจากร้านนี้ไม่ได้ในขณะนี้">{otherShops}</EmptyState>
        </>
      </PageReveal>
    );
  }

  const first = listStorefrontProducts(db, shop.id);
  return (
    <PageReveal>
      <>
        <header className={`card ${styles.identity} ${styles.storefront}`}>
          <ShopLogo name={shop.name} logoUrl={shop.logoUrl} />
          <div>
            <h1>{shop.name}</h1>
            <ShopRatingLine rating={shopRating(db, shop.id)} />
            <p className={styles.meta}>
              <span>{shop.province}</span>
              <span>
                เปิดร้านเมื่อ <time dateTime={shop.openedAt}>{formatThaiDate(shop.openedAt)}</time>
              </span>
              <span>สินค้า {formatNumber(shop.productCount)} ชิ้น</span>
            </p>
          </div>
          <div className={styles.about}>
            <p className={shop.description ? styles.description : styles.muted}>{shop.description || "ร้านนี้ยังไม่มีคำอธิบาย"}</p>
            {isOwner && (
              <Link href="/seller/settings" className="link-action">
                แก้ไขร้าน
              </Link>
            )}
          </div>
        </header>
        {first.items.length === 0 ? (
          <EmptyState art="shop" title="ร้านนี้ยังไม่มีสินค้า">
            {isOwner ? (
              <Link href="/seller/products/new" className="button">
                ลงสินค้าชิ้นแรก
              </Link>
            ) : (
              otherShops
            )}
          </EmptyState>
        ) : (
          <StorefrontProducts first={first} loadMore={loadMoreShopProductsAction.bind(null, shop.id)} />
        )}
      </>
    </PageReveal>
  );
}
