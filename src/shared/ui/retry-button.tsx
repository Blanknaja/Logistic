"use client";

import { useRouter } from "next/navigation";

/** ปุ่ม "ลองใหม่" ถ้าไม่ส่ง onRetry จะดึงข้อมูลของหน้านี้ใหม่จากเซิร์ฟเวอร์ */
export function RetryButton({ onRetry }: { onRetry?: () => void }) {
  const router = useRouter();
  return (
    <button type="button" className="button" onClick={onRetry ?? (() => router.refresh())}>
      ลองใหม่
    </button>
  );
}
