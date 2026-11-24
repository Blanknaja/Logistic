"use client";

import { useEffect, useRef, useState } from "react";
import { formatBaht } from "@/shared/format";
import styles from "./payment.module.css";

/** รูป QR โหลดไม่ขึ้น กดลองใหม่แล้วโหลดรูปเดิมซ้ำ ไม่สร้างการจ่ายเงินใหม่ (PAY-004) */
export function QrImage({ src, amount }: { src: string | null; amount: number }) {
  const [failed, setFailed] = useState(!src);
  const [attempt, setAttempt] = useState(0);
  const image = useRef<HTMLImageElement>(null);

  // รูปที่พังก่อนหน้าโหลดเสร็จจะไม่มี onError มาให้ ต้องดูเอง
  useEffect(() => {
    if (image.current?.complete && image.current.naturalWidth === 0) setFailed(true);
  }, [attempt]);

  if (failed) {
    return (
      <div role="alert" className={styles.alert}>
        <p>แสดง QR ไม่ได้</p>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => {
            setFailed(!src);
            setAttempt((n) => n + 1);
          }}
        >
          ลองใหม่
        </button>
      </div>
    );
  }
  return (
    <img
      key={attempt}
      ref={image}
      className={styles.qr}
      src={src ?? undefined}
      alt={`QR ของ PromptPay ยอด ${formatBaht(amount)}`}
      width={240}
      height={276}
      onError={() => setFailed(true)}
    />
  );
}
