"use client";

import type { ModelViewerElement } from "@google/model-viewer";
import { useEffect, useRef, useState } from "react";
import { RetryButton } from "@/shared/ui/retry-button";
import { ErrorState } from "@/shared/ui/states";
import { ProductImage } from "./product-image";
import styles from "./product-model.module.css";

/** โหลดเกินเวลานี้ถือว่าแสดงไม่ได้ (P3D-Q02) */
export const MODEL_LOAD_TIMEOUT_MS = 30_000;

// ตัวแสดงจำผลที่โหลดไม่สำเร็จไว้ตามที่อยู่ไฟล์จนกว่าจะปิดหน้า จึงต้องนับครั้งที่พังนอก component
// เพื่อให้ทั้งปุ่มลองใหม่และการกลับมาดูแบบ 3 มิติอีกครั้งใช้ที่อยู่ที่ยังไม่เคยพัง
const failures = new Map<string, number>();
const untriedUrl = (src: string) => {
  const failed = failures.get(src) ?? 0;
  return failed === 0 ? src : `${src}?retry=${failed}`;
};

/**
 * สินค้าแบบ 3 มิติที่หมุนด้วยการลาก ปุ่มลูกศร และซูมได้ (P3D-004) แสดงรูปปกกับสัญลักษณ์กำลังโหลดระหว่างรอ
 * ปุ่ม "ดูในห้องของคุณ" ตัวแสดงซ่อนเองบนอุปกรณ์ที่วางของในห้องไม่ได้ (P3D-005)
 */
export function ProductModel({ src, cover, alt }: { src: string; cover: string | null; alt: string }) {
  const viewer = useRef<ModelViewerElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const element = viewer.current;
    if (!element) return;
    let finished = false;
    const finish = (next: "ready" | "failed") => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (next === "failed") failures.set(src, (failures.get(src) ?? 0) + 1);
      setState(next);
    };
    const onLoad = () => finish("ready");
    const onError = () => finish("failed");
    const timer = setTimeout(onError, MODEL_LOAD_TIMEOUT_MS);
    element.addEventListener("load", onLoad);
    element.addEventListener("error", onError);
    // โค้ดของตัวแสดงอ่าน self และ customElements ตอนโหลด จึงโหลดได้เฉพาะในเบราว์เซอร์
    import("@google/model-viewer").catch(onError);
    return () => {
      clearTimeout(timer);
      element.removeEventListener("load", onLoad);
      element.removeEventListener("error", onError);
    };
  }, [attempt, src]);

  if (state === "failed") {
    const retry = () => {
      setState("loading");
      setAttempt((n) => n + 1);
    };
    return (
      <div className={styles.stage}>
        <ErrorState title="แสดงภาพ 3 มิติไม่ได้ ลองใหม่อีกครั้ง" action={<RetryButton onRetry={retry} />} />
      </div>
    );
  }

  return (
    <div className={styles.stage}>
      <model-viewer
        key={attempt}
        ref={viewer}
        className={styles.viewer}
        src={untriedUrl(src)}
        alt={alt}
        loading="eager"
        camera-controls
        touch-action="pan-y"
        ar
        ar-scale="fixed"
      >
        <button slot="ar-button" type="button" className={`button button-secondary ${styles.arButton}`}>
          ดูในห้องของคุณ
        </button>
      </model-viewer>
      {state === "loading" && (
        <div className={styles.cover}>
          <ProductImage src={cover} alt="" />
          <p role="status" className={styles.status}>
            กำลังโหลด
          </p>
        </div>
      )}
    </div>
  );
}
