import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { updateProductAction } from "@/features/product-listing/actions";
import { ProductForm } from "@/features/product-listing/components/product-form";
import styles from "@/features/product-listing/components/product-listing.module.css";
import { requireShop } from "@/features/shop/require-shop";
import { listCategories } from "@/features/product-listing/server/categories";
import { getProductForEdit } from "@/features/product-listing/server/products";
import { getDb } from "@/shared/db";
import { formatTimeOrDateTime } from "@/shared/format";

export const metadata: Metadata = { title: "แก้ไขสินค้า" };

export default async function EditProductPage({ params }: PageProps<"/seller/products/[productId]">) {
  const { productId } = await params;
  const viewer = await requireShop(`/seller/products/${productId}`);
  const db = getDb();
  const product = getProductForEdit(db, viewer.shopId, Number(productId));
  if (!product) notFound();

  return (
    <>
      <h1>แก้ไขสินค้า</h1>
      <p className={styles.meta}>
        <span className={styles.status}>{product.status}</span> แก้ล่าสุด {formatTimeOrDateTime(product.updatedAt)}
      </p>
      {/* key เปลี่ยนเมื่อสินค้าถูกแก้ กด "โหลดข้อมูลล่าสุด" แล้วฟอร์มจึงเริ่มใหม่จากข้อมูลล่าสุด */}
      <ProductForm
        key={product.updatedAt}
        categories={listCategories(db)}
        initial={product.values}
        status={product.status}
        modelFile={product.modelFile}
        save={updateProductAction.bind(null, product.id, product.updatedAt)}
      />
    </>
  );
}
