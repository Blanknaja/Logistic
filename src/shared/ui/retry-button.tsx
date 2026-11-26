"use client";

import { useRouter } from "next/navigation";

/**
 * ปุ่ม "ลองใหม่" ถ้าไม่ส่ง onRetry จะดึงข้อมูลของหน้านี้ใหม่จากเซิร์ฟเวอร์
 * secondary ใช้เมื่อหน้ามีปุ่มหลักอื่นอยู่แล้ว
 */
export function RetryButton({ onRetry, secondary = false }: { onRetry?: () => void; secondary?: boolean }) {
  const router = useRouter();
  return (
    <button type="button" className={secondary ? "button button-secondary" : "button"} onClick={onRetry ?? (() => router.refresh())}>
      ลองใหม่
    </button>
  );
}
