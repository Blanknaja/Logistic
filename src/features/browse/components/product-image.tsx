"use client";

import { useState } from "react";
import { categoryIconPath, tintIndex } from "@/shared/category-icons";
import styles from "./browse.module.css";

type Props = { src: string | null; alt: string; categoryId?: number | null };

/**
 * รูปสินค้า ไม่มีรูปหรือรูปโหลดไม่ขึ้นแสดงรูปแทนที่มีข้อความ "ไม่มีรูป" (BRW-001 BRW-008)
 * รูปแทนเป็นไอคอนของหมวดบนพื้นสีอ่อน ผู้ซื้อจึงอ่านว่ายังไม่มีรูป ไม่ใช่รูปพัง
 */
export function ProductImage({ src, alt, categoryId }: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src) {
    return (
      <div className={`${styles.noImage} ${styles[`tint${tintIndex(categoryId ?? 0)}`]}`}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d={categoryIconPath(categoryId)} />
        </svg>
        <span>ไม่มีรูป</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className={styles.image}
      loading="lazy"
      onError={() => setFailedSrc(src)}
      // รูปที่พังไปก่อน React เริ่มทำงานจะไม่เรียก onError จึงตรวจซ้ำตอนแปะ ref
      ref={(img) => {
        if (img?.complete && img.naturalWidth === 0) setFailedSrc(src);
      }}
    />
  );
}
