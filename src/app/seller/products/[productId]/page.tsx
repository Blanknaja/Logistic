import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { updateProductAction } from "@/features/product-listing/actions";
import { ProductForm } from "@/features/product-listing/components/product-form";
import styles from "@/features/product-listing/components/product-listing.module.css";
import { requireSeller } from "@/features/product-listing/require-seller";
import { listCategories } from "@/features/product-listing/server/categories";
import { getProductForEdit } from "@/features/product-listing/server/products";
import { getDb } from "@/shared/db";
import { formatDateTime } from "@/shared/format";

export const metadata: Metadata = { title: "แก้ไขสินค้า" };

export default async function EditProductPage({ params }: PageProps<"/seller/products/[productId]">) {
  const { productId } = await params;
  const viewer = await requireSeller(`/seller/products/${productId}`);
  const db = getDb();
  const product = getProductForEdit(db, viewer.shopId, Number(productId));
  if (!product) notFound();

  return (
    <>
      <h1>แก้ไขสินค้า</h1>
      <p className={styles.meta}>
        <span className={styles.status}>{product.status}</span> แก้ล่าสุด {formatDateTime(product.updatedAt)}
      </p>
      {/* key เปลี่ยนเมื่อสินค้าถูกแก้ กด "โหลดข้อมูลล่าสุด" แล้วฟอร์มจึงเริ่มใหม่จากข้อมูลล่าสุด */}
      <ProductForm
        key={product.updatedAt}
        categories={listCategories(db)}
        initial={product.values}
        status={product.status}
        save={updateProductAction.bind(null, product.id, product.updatedAt)}
      />
    </>
  );
}
