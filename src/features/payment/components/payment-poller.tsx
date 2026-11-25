"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { pollPaymentAction } from "@/features/payment/actions";

/** หน้ารอผลต้องเปลี่ยนเองภายใน 5 วินาทีหลังระบบรู้ผล (PAY-Q03) */
export const POLL_INTERVAL_MS = 3_000;

/** ถามผลซ้ำทุก 3 วินาทีระหว่างที่หน้านี้เปิดอยู่ แล้วโหลดข้อมูลหน้าใหม่ */
export function PaymentPoller({ groupId }: { groupId: number }) {
  const router = useRouter();
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      // ถามไม่สำเร็จไม่ต้องบอกผู้ซื้อ รอบหน้าถามใหม่
      await pollPaymentAction(groupId).catch(() => {});
      if (stopped) return;
      router.refresh();
      timer = setTimeout(tick, POLL_INTERVAL_MS);
    };
    timer = setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [groupId, router]);
  return null;
}
