import { redirect } from "next/navigation";
import styles from "@/features/shop/components/shop.module.css";
import { getShopSummary } from "@/features/shop/server/shops";
import { getDb } from "@/shared/db";
import { SellerMenu } from "@/shared/layout/seller-menu";
import { getCurrentAccount } from "@/shared/session";
import { SHOP_STATUS } from "@/shared/statuses";

/**
 * โครงของทุกหน้าในหลังบ้านของร้าน มีแถบบอกว่าร้านถูกระงับ (SHP-014)
 * และเมนูหลังบ้านที่รวมลิงก์จาก sellerMenu ใน nav.ts ของทุก feature (SHP-006)
 */
export default async function SellerLayout({ children }: LayoutProps<"/seller">) {
  const viewer = await getCurrentAccount();
  // layout ไม่รู้ว่าเปิดหน้าไหนอยู่ ให้หน้าพาไปหน้าเข้าสู่ระบบเองด้วย requireShop จะได้กลับมาหน้าเดิม
  if (!viewer) return children;
  if (viewer.shopId === null) redirect("/open-shop");
  const shop = getShopSummary(getDb(), viewer.shopId);

  return (
    <>
      {shop?.status === SHOP_STATUS.suspended && (
        <p role="alert" className={`notice notice-alert ${styles.banner}`}>
          ร้านของคุณถูกระงับโดยผู้ดูแลแพลตฟอร์ม
        </p>
      )}
      <div className={styles.menu}>
        <SellerMenu shopId={viewer.shopId} />
      </div>
      {children}
    </>
  );
}
