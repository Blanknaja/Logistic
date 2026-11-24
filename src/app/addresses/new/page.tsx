import type { Metadata } from "next";
import Link from "next/link";
import { safeNextPath } from "@/features/account/server/login-path";
import { AddressForm } from "@/features/checkout/components/address-form";
import styles from "@/features/checkout/components/addresses.module.css";
import { ADDRESS_LIMIT, listAddresses, MAX_ADDRESSES } from "@/features/checkout/server/addresses";
import { getDb } from "@/shared/db";
import { requireAccount } from "@/shared/session";
import { EmptyState } from "@/shared/ui/states";

export const metadata: Metadata = { title: "เพิ่มที่อยู่" };

export default async function NewAddressPage({ searchParams }: PageProps<"/addresses/new">) {
  const { next } = await searchParams;
  const back = typeof next === "string" ? safeNextPath(next) : null;
  const viewer = await requireAccount(back ? `/addresses/new?${new URLSearchParams({ next: back })}` : "/addresses/new");
  const full = listAddresses(getDb(), viewer.id).length >= MAX_ADDRESSES;

  return (
    <div className={styles.page}>
      <h1>เพิ่มที่อยู่</h1>
      {full ? (
        <EmptyState title={ADDRESS_LIMIT}>
          <Link href="/addresses" className="button">
            ไปหน้าที่อยู่จัดส่ง
          </Link>
        </EmptyState>
      ) : (
        <AddressForm next={back} />
      )}
    </div>
  );
}
