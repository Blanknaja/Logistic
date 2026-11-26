import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { safeNextPath } from "@/features/account/server/login-path";
import { AddressForm } from "@/features/checkout/components/address-form";
import styles from "@/features/checkout/components/addresses.module.css";
import { getAddress } from "@/features/checkout/server/addresses";
import { getDb } from "@/shared/db";
import { requireAccount } from "@/shared/session";
import { PageReveal } from "@/shared/ui/transitions";

export const metadata: Metadata = { title: "แก้ไขที่อยู่" };

export default async function EditAddressPage({ params, searchParams }: PageProps<"/addresses/[addressId]">) {
  const { addressId } = await params;
  const { next } = await searchParams;
  const back = typeof next === "string" ? safeNextPath(next) : null;
  const viewer = await requireAccount(
    back ? `/addresses/${addressId}?${new URLSearchParams({ next: back })}` : `/addresses/${addressId}`,
  );
  const address = getAddress(getDb(), viewer.id, Number(addressId));
  if (!address) notFound();

  return (
    <PageReveal>
      <div className={styles.page}>
        <h1>แก้ไขที่อยู่</h1>
        <AddressForm address={address} next={back} />
      </div>
    </PageReveal>
  );
}
