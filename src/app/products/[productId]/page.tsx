import Link from "next/link";
import { notFound } from "next/navigation";
import { addToCart } from "@/features/browse/actions";
import { AddToCartForm } from "@/features/browse/components/add-to-cart-form";
import { ProductGallery } from "@/features/browse/components/product-gallery";
import { browseHref } from "@/features/browse/search-params";
import { getProductDetail } from "@/features/browse/server/product-detail";
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
      <ProductGallery images={product.images} name={product.name} />
      <div>
        <h1>{product.name}</h1>
        <AddToCartForm
          product={product}
          signedIn={viewer !== null}
          isOwnShop={viewer?.shopId === product.shop.id}
          loginHref={`/login?next=${encodeURIComponent(`/products/${product.id}`)}`}
          addToCart={addToCart}
        />
        <p>
          ร้าน <Link href={`/shops/${product.shop.id}`}>{product.shop.name}</Link>
        </p>
        {product.category && (
          <p>
            หมวดหมู่ <Link href={browseHref({ category: String(product.category.id) })}>{product.category.name}</Link>
          </p>
        )}
        <h2>รายละเอียด</h2>
        <p className={styles.description}>{product.description}</p>
      </div>
    </article>
  );
}
