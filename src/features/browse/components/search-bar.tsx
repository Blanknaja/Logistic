"use client";

import Form from "next/form";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { MAX_QUERY_LENGTH, normalizeQuery } from "@/features/browse/search-params";
import { readSentence, understoodLabels } from "@/features/browse/sentence";
import { parseTrackingNo } from "@/features/delivery/tracking-no";
import type { Category } from "@/features/product-listing/server/categories";

export const SENTENCE_HINT = "พิมพ์เป็นประโยคได้ เช่น “รองเท้าไม่เกิน 500 ถูกสุด”";

/** สิ่งที่ระบบจะทำกับข้อความนี้เมื่อกดค้นหา หรือ null ถ้าเป็นคำค้นธรรมดา (SNT-011) */
export function searchPreview(text: string, categories: Category[]): { lead: string; detail: string } | null {
  const q = normalizeQuery(text);
  const trackingNo = parseTrackingNo(q);
  if (trackingNo) return { lead: "จะเปิดหน้าติดตามพัสดุ", detail: trackingNo };
  const sentence = readSentence(q, categories);
  return sentence && { lead: "จะค้นหา", detail: understoodLabels(sentence, categories).join(" · ") };
}

/**
 * ช่องค้นหาสินค้าในแถบด้านบนของทุกหน้า ส่งไปหน้าแรกที่เป็นหน้าผลการค้นหา
 * อยู่ใน layout จึงยังพิมพ์และกดค้นหาได้ระหว่างรอผล (BRW-012)
 */
export function SearchBar({ categories }: { categories: Category[] }) {
  const params = useSearchParams();
  const pathname = usePathname();
  // หน้าอื่นใช้ q เป็นคำค้นของตัวเอง เช่นสินค้าของร้าน จึงเติมคำค้นเฉพาะหน้าผลการค้นหา
  const q = pathname === "/" ? normalizeQuery(params?.get("q") ?? "") : "";
  // เปลี่ยนหน้าแล้วเริ่มใหม่ ข้อความที่พิมพ์ค้างไว้จึงไม่ตามไปหน้าถัดไป
  return <SearchForm key={`${pathname}?${q}`} q={q} categories={categories} />;
}

function SearchForm({ q, categories }: { q: string; categories: Category[] }) {
  const [text, setText] = useState(q);
  const preview = searchPreview(text, categories);
  return (
    <>
      <Form action="/" role="search" className="header-search">
        <input
          type="search"
          name="q"
          defaultValue={q}
          onChange={(event) => setText(event.target.value)}
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
      {/* CSS แสดงแถบนี้เฉพาะตอนที่ช่องค้นหาถูกเลือกอยู่ และมีข้อความข้างใน */}
      <div className="search-preview" role="status">
        {preview ? (
          <p className="container">
            <span>{preview.lead}</span> {preview.detail}
          </p>
        ) : (
          text.trim() === "" && (
            <p className="container">
              <span>{SENTENCE_HINT}</span>
            </p>
          )
        )}
      </div>
    </>
  );
}
