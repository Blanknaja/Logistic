"use client";

import { useState, type ReactNode } from "react";
import { Morph, productImageName } from "@/shared/ui/transitions";
import { ProductImage } from "./product-image";
import { ProductModel } from "./product-model";
import styles from "./browse.module.css";

/**
 * รูปใหญ่หนึ่งรูป กับรูปย่อที่กดสลับรูปใหญ่ได้ (BRW-008)
 * สินค้าที่มีไฟล์ 3 มิติมีทางเข้า "ดูแบบ 3 มิติ" ต่อท้ายรูปย่อ ไฟล์ถูกโหลดเมื่อกดเท่านั้น (P3D-003 P3D-Q01)
 */
type Props = { images: string[]; name: string; model: string | null; productId?: number; categoryId?: number | null };

export function ProductGallery({ images, name, model, productId, categoryId }: Props) {
  const [current, setCurrent] = useState(0);
  const showModel = model !== null && current === images.length;
  return (
    <div className={styles.gallery}>
      <div className={styles.plate}>
        {showModel ? (
          <ProductModel src={model} cover={images[0] ?? null} alt={name} />
        ) : (
          <PlateImage productId={productId}>
            <ProductImage src={images[current] ?? null} alt={name} categoryId={categoryId} />
          </PlateImage>
        )}
      </div>
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
                className={styles.view3d}
                aria-pressed={showModel}
                onClick={() => setCurrent(images.length)}
              >
                <CubeIcon />
                ดูแบบ 3 มิติ
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** รูปใหญ่ใช้ชื่อเดียวกับรูปในการ์ด รูปจึงขยายจากการ์ดมาเป็นรูปนี้ตอนเปลี่ยนหน้า */
function PlateImage({ productId, children }: { productId?: number; children: ReactNode }) {
  return productId === undefined ? children : <Morph name={productImageName(productId)}>{children}</Morph>;
}

function CubeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M12 1.8 21 7v10l-9 5.2L3 17V7l9-5.2Zm-7 6.9v7.1l6 3.5v-7.1L5 8.7Zm8 10.6 6-3.5V8.7l-6 3.5v7.1Zm5-12.3-6-3.5-6 3.5 6 3.5 6-3.5Z"
      />
    </svg>
  );
}
