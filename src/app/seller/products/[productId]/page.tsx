import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { deleteProductAction, setHiddenAction, updateProductAction } from "@/features/product-listing/actions";
import { DeleteButton } from "@/features/product-listing/components/delete-button";
import { Notice, noticeText } from "@/features/product-listing/components/product-list";
import { ProductForm } from "@/features/product-listing/components/product-form";
import styles from "@/features/product-listing/components/product-listing.module.css";
import { requireShop } from "@/features/shop/require-shop";
import { listCategories } from "@/features/product-listing/server/categories";
import { getProductForEdit } from "@/features/product-listing/server/products";
import { getDb } from "@/shared/db";
import { formatTimeOrDateTime } from "@/shared/format";
import { PRODUCT_STATUS } from "@/shared/statuses";
import { PageReveal } from "@/shared/ui/transitions";

export const metadata: Metadata = { title: "แก้ไขสินค้า" };

export default async function EditProductPage({ params, searchParams }: PageProps<"/seller/products/[productId]">) {
  const { productId } = await params;
  const viewer = await requireShop(`/seller/products/${productId}`);
  const db = getDb();
  const product = getProductForEdit(db, viewer.shopId, Number(productId));
  if (!product) notFound();

  const editPath = `/seller/products/${product.id}`;
  const hidden = product.status === PRODUCT_STATUS.hidden;
  return (
    <PageReveal>
      <>
        <header className={styles.intro}>
          <h1>แก้ไขสินค้า</h1>
          <div className={styles.statusLine}>
            <p className={styles.meta}>
              <span>{product.status}</span> แก้ล่าสุด <time dateTime={product.updatedAt}>{formatTimeOrDateTime(product.updatedAt)}</time>
            </p>
            {/* ร่างยังไม่เคยขาย จึงไม่มีซ่อนและเลิกซ่อน (PRD-008) */}
            {product.status !== PRODUCT_STATUS.draft && (
              <form action={setHiddenAction.bind(null, product.id, !hidden, `${editPath}?notice=${hidden ? "shown" : "hidden"}`)}>
                <button type="submit" className="link-action">
                  {hidden ? "เลิกซ่อนสินค้านี้" : "ซ่อนสินค้านี้"}
                </button>
              </form>
            )}
            <DeleteButton name={product.values.name} action={deleteProductAction.bind(null, product.id)} />
          </div>
        </header>
        <Notice text={noticeText(await searchParams)} />
        {/* key เปลี่ยนเมื่อสินค้าถูกแก้ กด "โหลดข้อมูลล่าสุด" แล้วฟอร์มจึงเริ่มใหม่จากข้อมูลล่าสุด
            ซ่อนและเลิกซ่อนไม่เปลี่ยน key สิ่งที่แก้ค้างไว้ในฟอร์มจึงยังอยู่ */}
        <ProductForm
          key={product.updatedAt}
          categories={listCategories(db)}
          initial={product.values}
          status={product.status}
          modelFile={product.modelFile}
          save={updateProductAction.bind(null, product.id, product.updatedAt)}
        />
      </>
    </PageReveal>
  );
}
