"use client";

import Form from "next/form";
import { useSearchParams } from "next/navigation";
import { MAX_QUERY_LENGTH, normalizeQuery } from "@/features/browse/search-params";
import styles from "./browse.module.css";

/** ช่องค้นหาอยู่ใน layout จึงยังพิมพ์และกดค้นหาได้ระหว่างรอผล (BRW-012) */
export function SearchBar() {
  const q = normalizeQuery(useSearchParams().get("q") ?? "");
  return (
    <Form action="/" role="search" className={styles.search}>
      <input
        key={q}
        type="search"
        name="q"
        defaultValue={q}
        maxLength={MAX_QUERY_LENGTH}
        className="input"
        aria-label="คำค้น"
        placeholder="ค้นหาสินค้า"
      />
      <button type="submit" className="button">
        ค้นหา
      </button>
    </Form>
  );
}
