import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { saveShopSettingsAction } from "@/features/shop/actions";
import { ShopForm } from "@/features/shop/components/shop-form";
import styles from "@/features/shop/components/shop.module.css";
import { requireShop } from "@/features/shop/require-shop";
import { getShopSettings } from "@/features/shop/server/shops";
import { getDb } from "@/shared/db";
import { SHOP_STATUS } from "@/shared/statuses";

export const metadata: Metadata = { title: "ตั้งค่าร้าน" };

export default async function ShopSettingsPage({ searchParams }: PageProps<"/seller/settings">) {
  const viewer = await requireShop("/seller/settings");
  // อ่านจากเจ้าของร้าน จึงเห็นได้แค่ร้านของตัวเอง (SHP-015)
  const shop = getShopSettings(getDb(), viewer.id);
  if (!shop) notFound();
  const { saved } = await searchParams;
  const suspended = shop.status === SHOP_STATUS.suspended;

  return (
    <div className={styles.formPage}>
      <h1>ตั้งค่าร้าน</h1>
      {saved && !suspended && (
        <p role="status" className={styles.notice}>
          บันทึกแล้ว
        </p>
      )}
      {/* key เปลี่ยนเมื่อบันทึกแล้ว ฟอร์มจึงเริ่มใหม่จากค่าที่บันทึก */}
      <ShopForm
        key={shop.updatedAt}
        mode="settings"
        action={saveShopSettingsAction}
        shop={shop}
        readOnly={suspended}
        cancelHref="/seller"
      />
    </div>
  );
}
