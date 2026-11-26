import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { openShopAction } from "@/features/shop/actions";
import { ShopForm } from "@/features/shop/components/shop-form";
import styles from "@/features/shop/components/shop.module.css";
import { SHOP_FORM_MESSAGES } from "@/features/shop/server/rules";
import { requireAccount } from "@/shared/session";
import { EmptyState } from "@/shared/ui/states";

export const metadata: Metadata = { title: "เปิดร้าน" };

export default async function OpenShopPage() {
  const viewer = await requireAccount("/open-shop");
  if (viewer.shopId !== null) redirect("/seller");
  if (viewer.isAdmin) return <EmptyState level={1} title={SHOP_FORM_MESSAGES.admin} />;

  return (
    <div className={styles.formPage}>
      <header className={styles.formIntro}>
        <h1>เปิดร้าน</h1>
        <p className={styles.muted}>กรอกชื่อร้านและที่อยู่ต้นทางที่ใช้ส่งพัสดุ เปิดร้านได้ทันทีไม่ต้องรออนุมัติ</p>
      </header>
      <ShopForm mode="open" action={openShopAction} cancelHref="/" />
    </div>
  );
}
