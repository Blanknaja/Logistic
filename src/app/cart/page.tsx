import type { Metadata } from "next";
import Link from "next/link";
import { CartView } from "@/features/cart/components/cart-view";
import { getCart } from "@/features/cart/server/cart";
import { getDb } from "@/shared/db";
import { requireAccount } from "@/shared/session";
import { EmptyState } from "@/shared/ui/states";

export const metadata: Metadata = { title: "ตะกร้า" };

export default async function CartPage() {
  const viewer = await requireAccount("/cart");
  const cart = getCart(getDb(), viewer.id);

  return (
    <>
      <h1>ตะกร้า</h1>
      {cart.itemCount === 0 ? (
        <EmptyState title="ตะกร้ายังว่าง">
          <Link href="/" className="button">
            เลือกซื้อสินค้า
          </Link>
        </EmptyState>
      ) : (
        <CartView cart={cart} />
      )}
    </>
  );
}
