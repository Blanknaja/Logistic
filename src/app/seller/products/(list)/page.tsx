import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/features/product-listing/components/product-listing.module.css";
import { listParams, NoProducts, Notice, ProductList, statusOf } from "@/features/product-listing/components/product-list";
import { requireSeller } from "@/features/product-listing/require-seller";
import { countShopProducts, listShopProducts } from "@/features/product-listing/server/products";
import { getDb } from "@/shared/db";

export const metadata: Metadata = { title: "สินค้าของร้าน" };

export default async function SellerProductsPage({ searchParams }: PageProps<"/seller/products">) {
  const viewer = await requireSeller("/seller/products");
  const { statusKey, q, page, notice } = listParams(await searchParams);
  const db = getDb();
  const counts = countShopProducts(db, viewer.shopId);

  if (counts.all === 0) {
    return (
      <>
        <h1>สินค้า</h1>
        <Notice text={notice} />
        <NoProducts />
      </>
    );
  }

  const result = listShopProducts(db, viewer.shopId, { status: statusOf(statusKey), q, page });
  return (
    <>
      <div className={styles.heading}>
        <h1>สินค้า</h1>
        <Link href="/seller/products/new" className="button">
          เพิ่มสินค้า
        </Link>
      </div>
      <Notice text={notice} />
      <ProductList counts={counts} result={result} statusKey={statusKey} q={q} />
    </>
  );
}
