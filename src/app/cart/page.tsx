import type { Metadata } from "next";
import Link from "next/link";
import { CartView } from "@/features/cart/components/cart-view";
import { getCart } from "@/features/cart/server/cart";
import { SHIPPING_FEE } from "@/features/checkout/server/checkout";
import { getDb } from "@/shared/db";
import { formatNumber } from "@/shared/format";
import { requireAccount } from "@/shared/session";

export const metadata: Metadata = { title: "ตะกร้า" };

export default async function CartPage() {
  const viewer = await requireAccount("/cart");
  const cart = getCart(getDb(), viewer.id);

  if (cart.itemCount === 0) {
    return (
      <>
        <h1>ตะกร้ายังว่าง</h1>
        <Link href="/" className="button">
          เลือกซื้อสินค้า
        </Link>
      </>
    );
  }
  return (
    <>
      <h1>{`ตะกร้ามี ${formatNumber(cart.itemCount)} รายการ`}</h1>
      <CartView cart={cart} shippingFee={SHIPPING_FEE} />
    </>
  );
}
