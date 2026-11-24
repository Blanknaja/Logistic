import type { ReactNode } from "react";
import { SearchBar } from "@/features/browse/components/search-bar";

export default function BrowseLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <h1>ซื้อของจากหลายร้านในที่เดียว</h1>
      <SearchBar />
      {children}
    </>
  );
}
