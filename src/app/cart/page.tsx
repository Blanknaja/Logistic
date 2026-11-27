import type { Metadata } from "next";
import Link from "next/link";
import { CartView } from "@/features/cart/components/cart-view";
import { getCart } from "@/features/cart/server/cart";
import { SHIPPING_FEE } from "@/features/checkout/server/checkout";
import { getDb } from "@/shared/db";
import { formatNumber } from "@/shared/format";
import { requireAccount } from "@/shared/session";
import { PurchaseSteps } from "@/shared/ui/journey";
import { StateArtIcon } from "@/shared/ui/states";
import { PageSlide } from "@/shared/ui/transitions";
import styles from "@/features/cart/components/cart.module.css";

export const metadata: Metadata = { title: "ตะกร้า" };

export default async function CartPage() {
  const viewer = await requireAccount("/cart");
  const cart = getCart(getDb(), viewer.id);

  if (cart.itemCount === 0) {
    return (
      <PageSlide>
        <section className={`card ${styles.empty}`}>
          <StateArtIcon art="cart" />
          <h1>ตะกร้ายังว่าง</h1>
          <p>เลือกของจากหลายร้านใส่ตะกร้าเดียว แล้วจ่ายครั้งเดียว</p>
          <Link href="/" className="button">
            เลือกซื้อสินค้า
          </Link>
        </section>
      </PageSlide>
    );
  }
  return (
    <PageSlide>
      <div>
        <PurchaseSteps current={0} />
        <h1>{`ตะกร้ามี ${formatNumber(cart.itemCount)} รายการ`}</h1>
        <CartView cart={cart} shippingFee={SHIPPING_FEE} />
      </div>
    </PageSlide>
  );
}
