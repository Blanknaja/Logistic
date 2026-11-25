import type { ReactNode } from "react";
import { SearchBar } from "@/features/browse/components/search-bar";
import styles from "@/features/browse/components/browse.module.css";

export default function BrowseLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <h1 className={styles.title}>ซื้อของจากหลายร้านในที่เดียว</h1>
      <SearchBar />
      {children}
    </>
  );
}
