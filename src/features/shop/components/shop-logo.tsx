import { logoLetter } from "@/features/shop/server/rules";
import styles from "./shop.module.css";

/** โลโก้ร้าน ร้านที่ยังไม่มีโลโก้แสดงตัวอักษรตัวแรกของชื่อร้านในวงกลม (SHP-008) */
export function ShopLogo({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  if (logoUrl) return <img src={logoUrl} alt={`โลโก้ร้าน ${name}`} className={styles.logo} />;
  return (
    <span className={styles.logo} role="img" aria-label={`โลโก้ร้าน ${name}`}>
      {logoLetter(name)}
    </span>
  );
}
