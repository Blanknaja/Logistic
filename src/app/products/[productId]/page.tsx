import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCartForm } from "@/features/browse/components/add-to-cart-form";
import { ProductGallery } from "@/features/browse/components/product-gallery";
import { browseHref } from "@/features/browse/search-params";
import { getProductDetail } from "@/features/browse/server/product-detail";
import { addToCartAction } from "@/features/cart/actions";
import { getDb } from "@/shared/db";
import { getCurrentAccount } from "@/shared/session";
import styles from "@/features/browse/components/browse.module.css";

export default async function ProductPage({ params }: PageProps<"/products/[productId]">) {
  const { productId } = await params;
  const product = getProductDetail(getDb(), Number(productId));
  if (!product) notFound();
  const viewer = await getCurrentAccount();

  return (
    <article className={styles.detail}>
      <header className={styles.intro}>
        <p className={styles.kicker}>
          {product.category && (
            <>
              หมวดหมู่ <Link href={browseHref({ category: String(product.category.id) })}>{product.category.name}</Link>
              <span aria-hidden="true"> · </span>
            </>
          )}
          ร้าน <Link href={`/shops/${product.shop.id}`}>{product.shop.name}</Link>
        </p>
        <h1>{product.name}</h1>
      </header>
      <ProductGallery images={product.images} name={product.name} model={product.model} />
      <AddToCartForm
        product={product}
        signedIn={viewer !== null}
        isOwnShop={viewer?.shopId === product.shop.id}
        loginHref={`/login?next=${encodeURIComponent(`/products/${product.id}`)}`}
        addToCart={addToCartAction}
      />
      <section className={styles.story} aria-labelledby="product-description">
        <h2 id="product-description">รายละเอียด</h2>
        <p className={styles.description}>{product.description}</p>
      </section>
    </article>
  );
}
