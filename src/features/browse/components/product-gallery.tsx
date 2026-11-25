"use client";

import { useState } from "react";
import { ProductImage } from "./product-image";
import { ProductModel } from "./product-model";
import styles from "./browse.module.css";
import modelStyles from "./product-model.module.css";

/**
 * รูปใหญ่หนึ่งรูป กับรูปย่อที่กดสลับรูปใหญ่ได้ (BRW-008)
 * สินค้าที่มีไฟล์ 3 มิติมีทางเข้า "ดูแบบ 3 มิติ" ต่อท้ายรูปย่อ ไฟล์ถูกโหลดเมื่อกดเท่านั้น (P3D-003 P3D-Q01)
 */
export function ProductGallery({ images, name, model }: { images: string[]; name: string; model: string | null }) {
  const [current, setCurrent] = useState(0);
  const showModel = model !== null && current === images.length;
  return (
    <div>
      {showModel ? (
        <ProductModel src={model} cover={images[0] ?? null} alt={name} />
      ) : (
        <ProductImage src={images[current] ?? null} alt={name} />
      )}
      {(images.length > 1 || model !== null) && (
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
          {model !== null && (
            <li>
              <button
                type="button"
                className={`${styles.thumb} ${modelStyles.thumb}`}
                aria-pressed={showModel}
                onClick={() => setCurrent(images.length)}
              >
                ดูแบบ 3 มิติ
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
