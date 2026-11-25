import Link from "next/link";
import { notFound } from "next/navigation";
import browse from "@/features/browse/components/browse.module.css";
import { loadMoreShopProductsAction } from "@/features/shop/actions";
import { ShopLogo } from "@/features/shop/components/shop-logo";
import styles from "@/features/shop/components/shop.module.css";
import { StorefrontProducts } from "@/features/shop/components/storefront-products";
import { getStorefront, listStorefrontProducts } from "@/features/shop/server/storefront";
import { getDb } from "@/shared/db";
import { formatDate, formatNumber } from "@/shared/format";
import { getCurrentAccount } from "@/shared/session";
import { SHOP_STATUS } from "@/shared/statuses";
import { EmptyState } from "@/shared/ui/states";

/** หน้าร้านที่ทุกคนเปิดดูได้ (SHP-011 SHP-012 SHP-014) */
export default async function StorefrontPage({ params }: PageProps<"/shops/[shopId]">) {
  const { shopId } = await params;
  const db = getDb();
  const shop = /^\d+$/.test(shopId) ? getStorefront(db, Number(shopId)) : null;
  if (!shop) notFound();
  const viewer = await getCurrentAccount();
  const isOwner = viewer?.shopId === shop.id;

  const identity = (
    <div className={styles.identity}>
      <ShopLogo name={shop.name} logoUrl={shop.logoUrl} />
      <h1>{shop.name}</h1>
    </div>
  );

  if (shop.status === SHOP_STATUS.suspended) {
    return (
      <>
        {identity}
        <EmptyState title="ร้านนี้ถูกระงับ ซื้อสินค้าจากร้านนี้ไม่ได้ในขณะนี้" />
      </>
    );
  }

  const first = listStorefrontProducts(db, shop.id);
  return (
    <>
      {identity}
      <p className={browse.description}>{shop.description || "ร้านนี้ยังไม่มีคำอธิบาย"}</p>
      <ul className="chips">
        <li className="chip">{shop.province}</li>
        <li className="chip">เปิดร้านเมื่อ {formatDate(shop.openedAt)}</li>
        <li className="chip">สินค้า {formatNumber(shop.productCount)} ชิ้น</li>
      </ul>
      {isOwner && (
        <div className={styles.actions}>
          <Link href="/seller/settings" className="button button-secondary">
            แก้ไขร้าน
          </Link>
        </div>
      )}
      {first.items.length === 0 ? (
        <EmptyState title="ร้านนี้ยังไม่มีสินค้า">
          {isOwner && (
            <Link href="/seller/products/new" className="button">
              ลงสินค้าชิ้นแรก
            </Link>
          )}
        </EmptyState>
      ) : (
        <StorefrontProducts first={first} loadMore={loadMoreShopProductsAction.bind(null, shop.id)} />
      )}
    </>
  );
}
