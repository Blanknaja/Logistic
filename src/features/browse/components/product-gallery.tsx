"use client";

import { useState } from "react";
import { ProductImage } from "./product-image";
import styles from "./browse.module.css";

/** รูปใหญ่หนึ่งรูป กับรูปย่อที่กดสลับรูปใหญ่ได้ (BRW-008) */
export function ProductGallery({ images, name }: { images: string[]; name: string }) {
  const [current, setCurrent] = useState(0);
  return (
    <div>
      <ProductImage src={images[current] ?? null} alt={name} />
      {images.length > 1 && (
        <ul className={styles.thumbs}>
          {images.map((url, index) => (
            <li key={index}>
              <button
                type="button"
                className={styles.thumb}
                aria-label={`ดูรูปที่ ${index + 1}`}
                aria-pressed={index === current}
                onClick={() => setCurrent(index)}
              >
                <ProductImage src={url} alt="" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
