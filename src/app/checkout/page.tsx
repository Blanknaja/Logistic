import type { Metadata } from "next";
import Link from "next/link";
import { CheckoutForm } from "@/features/checkout/components/checkout-form";
import { placeOrderAction } from "@/features/checkout/place-order-actions";
import { getCheckout } from "@/features/checkout/server/checkout";
import { getDb } from "@/shared/db";
import { requireAccount } from "@/shared/session";
import { EmptyState } from "@/shared/ui/states";

export const metadata: Metadata = { title: "สั่งซื้อ" };

export default async function CheckoutPage({ searchParams }: PageProps<"/checkout">) {
  const viewer = await requireAccount("/checkout");
  const checkout = getCheckout(getDb(), viewer.id);
  // หน้าเพิ่มที่อยู่พากลับมาพร้อม ?addressId= ของที่อยู่ที่เพิ่งบันทึก
  const { addressId } = await searchParams;
  const chosen = checkout.addresses.find((address) => String(address.id) === addressId);

  if (checkout.shops.length === 0) {
    return (
      <EmptyState level={1} title="ยังไม่ได้เลือกสินค้า">
        <Link href="/cart" className="button">
          กลับไปตะกร้า
        </Link>
      </EmptyState>
    );
  }

  return (
    <>
      <h1>ตรวจที่อยู่และยอดที่ต้องจ่าย</h1>
      <CheckoutForm checkout={checkout} selectedAddressId={chosen?.id ?? checkout.addresses[0]?.id} action={placeOrderAction} />
    </>
  );
}
