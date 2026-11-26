import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCartForm } from "@/features/browse/components/add-to-cart-form";
import { ProductGallery } from "@/features/browse/components/product-gallery";
import { browseHref } from "@/features/browse/search-params";
import { getProductDetail } from "@/features/browse/server/product-detail";
import { addToCartAction } from "@/features/cart/actions";
import { SHIPPING_FEE } from "@/features/checkout/server/checkout";
import { ProductRating, ProductReviews } from "@/features/review/components/product-reviews";
import { getDb } from "@/shared/db";
import { getCurrentAccount } from "@/shared/session";
import styles from "@/features/browse/components/browse.module.css";

/** จอ 900 ขึ้นไป รูปอยู่ซ้าย ชื่อ ราคา ตัวเลือก และปุ่มอยู่ขวาในจอแรก ร้านกับรายละเอียดอยู่ข้างล่าง */
export default async function ProductPage({ params, searchParams }: PageProps<"/products/[productId]">) {
  const { productId } = await params;
  const product = getProductDetail(getDb(), Number(productId));
  if (!product) notFound();
  const viewer = await getCurrentAccount();

  return (
    <article className={styles.detail}>
      <div className={styles.buyArea}>
        <h1 className={styles.name}>
          {product.name}
          <ProductRating productId={product.id} />
        </h1>
        <ProductGallery images={product.images} name={product.name} model={product.model} />
        <AddToCartForm
          product={product}
          signedIn={viewer !== null}
          isOwnShop={viewer?.shopId === product.shop.id}
          loginHref={`/login?next=${encodeURIComponent(`/products/${product.id}`)}`}
          shippingFee={SHIPPING_FEE}
          addToCart={addToCartAction}
        />
      </div>
      <dl className={styles.facts}>
        <div>
          <dt>ร้าน</dt>
          <dd>
            <Link href={`/shops/${product.shop.id}`}>{product.shop.name}</Link>
          </dd>
        </div>
        {product.category && (
          <div>
            <dt>หมวดหมู่</dt>
            <dd>
              <Link href={browseHref({ category: String(product.category.id) })}>{product.category.name}</Link>
            </dd>
          </div>
        )}
      </dl>
      <section className={styles.story} aria-labelledby="product-description">
        <h2 id="product-description">รายละเอียด</h2>
        <p className={styles.description}>{product.description}</p>
      </section>
      <ProductReviews productId={product.id} query={await searchParams} />
    </article>
  );
}
