import type { Metadata } from "next";
import Link from "next/link";
import { CheckoutForm } from "@/features/checkout/components/checkout-form";
import { placeOrderAction } from "@/features/checkout/place-order-actions";
import { getCheckout } from "@/features/checkout/server/checkout";
import { getDb } from "@/shared/db";
import { requireAccount } from "@/shared/session";
import { EmptyState } from "@/shared/ui/states";

export const metadata: Metadata = { title: "สั่งซื้อ" };

export default async function CheckoutPage() {
  const viewer = await requireAccount("/checkout");
  const checkout = getCheckout(getDb(), viewer.id);

  if (checkout.shops.length === 0) {
    return (
      <EmptyState title="ยังไม่ได้เลือกสินค้า">
        <Link href="/cart" className="button">
          กลับไปตะกร้า
        </Link>
      </EmptyState>
    );
  }

  return (
    <>
      <h1>สั่งซื้อ</h1>
      <CheckoutForm checkout={checkout} action={placeOrderAction} />
    </>
  );
}
