"use client";

import { useState } from "react";
import styles from "./browse.module.css";

/** รูปสินค้า ไม่มีรูปหรือรูปโหลดไม่ขึ้นแสดงรูปแทนที่มีข้อความ "ไม่มีรูป" (BRW-001 BRW-008) */
export function ProductImage({ src, alt }: { src: string | null; alt: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src) return <div className={styles.noImage}>ไม่มีรูป</div>;
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
