import type { ReactNode } from "react";
import styles from "@/features/browse/components/browse.module.css";

/** ช่องค้นหาอยู่ในแถบด้านบนของทุกหน้า (SearchBar ใน SiteHeader) */
export default function BrowseLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <h1 className={styles.title}>ซื้อของจากหลายร้านในที่เดียว</h1>
      {children}
    </>
  );
}
