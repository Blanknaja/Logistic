import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCartForm } from "@/features/browse/components/add-to-cart-form";
import { ProductCard } from "@/features/browse/components/product-card";
import { ProductGallery } from "@/features/browse/components/product-gallery";
import { browseHref } from "@/features/browse/search-params";
import { getProductDetail } from "@/features/browse/server/product-detail";
import { addToCartAction } from "@/features/cart/actions";
import { SHIPPING_FEE } from "@/features/checkout/server/checkout";
import { ShopLogo } from "@/features/shop/components/shop-logo";
import { getStorefront, listStorefrontProducts } from "@/features/shop/server/storefront";
import { getDb } from "@/shared/db";
import { getCurrentAccount } from "@/shared/session";
import { PageReveal } from "@/shared/ui/transitions";
import styles from "@/features/browse/components/browse.module.css";

/** จำนวนสินค้าอื่นของร้านที่ชวนดูต่อใต้รายละเอียด */
const MORE_FROM_SHOP = 4;

/** จอ 900 ขึ้นไป รูปอยู่ซ้าย ชื่อกับกล่องซื้ออยู่ขวาในจอแรก การ์ดร้าน รายละเอียด และสินค้าอื่นของร้านอยู่ข้างล่าง */
export default async function ProductPage({ params }: PageProps<"/products/[productId]">) {
  const { productId } = await params;
  const db = getDb();
  const product = getProductDetail(db, Number(productId));
  if (!product) notFound();
  const viewer = await getCurrentAccount();
  const shop = getStorefront(db, product.shop.id);
  const more = listStorefrontProducts(db, product.shop.id)
    .items.filter((item) => item.id !== product.id)
    .slice(0, MORE_FROM_SHOP);

  return (
    <PageReveal>
      <article className={styles.detail}>
        <div className={styles.buyArea}>
          <h1 className={styles.name}>{product.name}</h1>
          <ProductGallery
            images={product.images}
            name={product.name}
            model={product.model}
            productId={product.id}
            categoryId={product.category?.id}
          />
          <AddToCartForm
            product={product}
            signedIn={viewer !== null}
            isOwnShop={viewer?.shopId === product.shop.id}
            loginHref={`/login?next=${encodeURIComponent(`/products/${product.id}`)}`}
            shippingFee={SHIPPING_FEE}
            addToCart={addToCartAction}
          />
        </div>
        <section className={`card ${styles.shopCard}`} aria-label="ร้าน">
          <ShopLogo name={product.shop.name} logoUrl={shop?.logoUrl ?? null} />
          <div>
            <p className={styles.shopName}>{product.shop.name}</p>
            {product.category && (
              <p className={styles.muted}>
                หมวดหมู่ <Link href={browseHref({ category: String(product.category.id) })}>{product.category.name}</Link>
              </p>
            )}
          </div>
          <Link href={`/shops/${product.shop.id}`} className="button button-secondary">
            ดูร้าน
          </Link>
        </section>
        <section className={styles.story} aria-labelledby="product-description">
          <h2 id="product-description">รายละเอียด</h2>
          <p className={styles.description}>{product.description}</p>
        </section>
        {more.length > 0 && (
          <section className={styles.more} aria-labelledby="more-from-shop">
            <h2 id="more-from-shop">สินค้าอื่นของร้านนี้</h2>
            <ul className={styles.grid}>
              {more.map((item) => (
                <li key={item.id} className="reveal">
                  <ProductCard item={item} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </PageReveal>
  );
}
