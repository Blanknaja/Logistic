import type { Metadata } from "next";
import Link from "next/link";
import { deleteAddressAction, setDefaultAddressAction } from "@/features/checkout/address-actions";
import styles from "@/features/checkout/components/addresses.module.css";
import { PendingButton } from "@/features/checkout/components/pending-button";
import { ADDRESS_GONE, fullAddress, listAddresses } from "@/features/checkout/server/addresses";
import { getDb } from "@/shared/db";
import { requireAccount } from "@/shared/session";
import { EmptyState } from "@/shared/ui/states";
import { PageReveal } from "@/shared/ui/transitions";

export const metadata: Metadata = { title: "ที่อยู่จัดส่ง" };

const NOTICES: Record<string, string> = {
  saved: "บันทึกที่อยู่แล้ว",
  deleted: "ลบที่อยู่แล้ว",
  gone: ADDRESS_GONE,
};

export default async function AddressesPage({ searchParams }: PageProps<"/addresses">) {
  const viewer = await requireAccount("/addresses");
  const addresses = listAddresses(getDb(), viewer.id);
  const { notice, delete: confirming } = await searchParams;
  const message = typeof notice === "string" && Object.hasOwn(NOTICES, notice) ? NOTICES[notice] : null;
  // ระหว่างถามยืนยันลบ ปุ่ม "ไม่ลบ" เป็นปุ่มหลักของหน้า ปุ่มที่ลบจริงไม่ใช้สีเน้น
  const asking = addresses.some((address) => String(address.id) === confirming);
  const addButton = (
    <Link href="/addresses/new" className={asking ? "button button-secondary" : "button"}>
      เพิ่มที่อยู่
    </Link>
  );

  return (
    <PageReveal>
      <div className={styles.page}>
        <h1>ที่อยู่จัดส่ง</h1>
        {message && (
          <p role={notice === "gone" ? "alert" : "status"} className={notice === "gone" ? "notice notice-alert" : "notice"}>
            {message}
          </p>
        )}
        {addresses.length === 0 ? (
          <EmptyState art="pin" title="ยังไม่มีที่อยู่จัดส่ง">
            {addButton}
          </EmptyState>
        ) : (
          <>
            {addButton}
            <ul className={styles.list}>
              {addresses.map((address) => (
                <li key={address.id} className={`card ${styles.item}`}>
                  <p>
                    {address.recipientName} {address.phone}
                    {address.isDefault && <span className={`badge badge-success ${styles.badge}`}>ที่อยู่หลัก</span>}
                  </p>
                  <p className={styles.muted}>{fullAddress(address)}</p>
                  {String(address.id) === confirming ? (
                    <div className={styles.actions}>
                      <p>ลบที่อยู่นี้ใช่ไหม</p>
                      <form action={deleteAddressAction}>
                        <input type="hidden" name="addressId" value={address.id} />
                        <PendingButton label="ยืนยันลบ" pendingLabel="กำลังลบ..." variant="secondary" />
                      </form>
                      <Link href="/addresses" scroll={false} className="button">
                        ไม่ลบ
                      </Link>
                    </div>
                  ) : (
                    <div className={styles.actions}>
                      <Link href={`/addresses/${address.id}`} className="link-action">
                        แก้ไข
                      </Link>
                      <Link href={`/addresses?delete=${address.id}`} scroll={false} className="link-action">
                        ลบ
                      </Link>
                      {!address.isDefault && (
                        <form action={setDefaultAddressAction}>
                          <input type="hidden" name="addressId" value={address.id} />
                          <PendingButton label="ตั้งเป็นที่อยู่หลัก" pendingLabel="กำลังตั้ง..." variant="link" />
                        </form>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </PageReveal>
  );
}
