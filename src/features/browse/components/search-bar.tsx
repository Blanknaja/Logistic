"use client";

import Form from "next/form";
import { usePathname, useSearchParams } from "next/navigation";
import { MAX_QUERY_LENGTH, normalizeQuery } from "@/features/browse/search-params";

/**
 * ช่องค้นหาสินค้าในแถบด้านบนของทุกหน้า ส่งไปหน้าแรกที่เป็นหน้าผลการค้นหา
 * อยู่ใน layout จึงยังพิมพ์และกดค้นหาได้ระหว่างรอผล (BRW-012)
 */
export function SearchBar() {
  const params = useSearchParams();
  // หน้าอื่นใช้ q เป็นคำค้นของตัวเอง เช่นสินค้าของร้าน จึงเติมคำค้นเฉพาะหน้าผลการค้นหา
  const q = usePathname() === "/" ? normalizeQuery(params?.get("q") ?? "") : "";
  return (
    <Form action="/" role="search" className="header-search">
      <input
        key={q}
        type="search"
        name="q"
        defaultValue={q}
        maxLength={MAX_QUERY_LENGTH}
        enterKeyHint="search"
        className="input"
        aria-label="คำค้น"
        placeholder="ค้นหาสินค้า"
      />
      <button type="submit" className="header-search-button">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
          <path
            fill="currentColor"
            d="M10.5 3a7.5 7.5 0 0 1 5.96 12.05l4.25 4.24-1.42 1.42-4.24-4.25A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z"
          />
        </svg>
        <span className="visually-hidden">ค้นหา</span>
      </button>
    </Form>
  );
}
