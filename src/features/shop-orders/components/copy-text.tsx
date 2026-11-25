"use client";

import { useState, useSyncExternalStore } from "react";
import styles from "./shop-orders.module.css";

const noSubscribe = () => () => {};

/** ปุ่มคัดลอกข้อความ ขึ้นเฉพาะเบราว์เซอร์ที่คัดลอกได้ ที่เหลือเลือกข้อความเองได้ตามปกติ */
export function CopyText({ text, label }: { text: string; label: string }) {
  const canCopy = useSyncExternalStore(
    noSubscribe,
    () => Boolean(navigator.clipboard),
    () => false,
  );
  const [result, setResult] = useState<"copied" | "failed" | null>(null);
  if (!canCopy) return null;

  return (
    <span className={styles.copy}>
      <button
        type="button"
        className="link-action"
        onClick={() =>
          navigator.clipboard.writeText(text).then(
            () => setResult("copied"),
            () => setResult("failed"),
          )
        }
      >
        {label}
      </button>
      <span role="status" className={styles.muted}>
        {result === "copied" ? "คัดลอกแล้ว" : result === "failed" ? "คัดลอกไม่ได้ เลือกข้อความเองแทน" : ""}
      </span>
    </span>
  );
}
