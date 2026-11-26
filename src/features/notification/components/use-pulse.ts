"use client";

import { usePathname } from "next/navigation";
import { useEffect, useEffectEvent } from "react";
import { notificationPulseAction } from "@/features/notification/actions";
import type { Pulse } from "@/features/notification/server/notifications";

/** ถามทุก 5 วินาที หน้าที่เปิดค้างจึงเห็นแจ้งเตือนใหม่ภายใน 10 วินาที (NTF-014 NTF-Q02) */
export const PULSE_INTERVAL_MS = 5_000;

/** ถามหนึ่งรอบ เน็ตหลุด เซิร์ฟเวอร์ไม่ตอบ หรือออกจากระบบแล้วได้ null หน้าจึงแสดงค่าล่าสุดที่รู้ต่อไป (NTF-015) */
export async function askPulse(ask: (sinceId: number) => Promise<Pulse | null>, sinceId: number): Promise<Pulse | null> {
  try {
    return await ask(sinceId);
  } catch {
    return null;
  }
}

/**
 * เรียก onPulse ด้วยจำนวนล่าสุดจากเซิร์ฟเวอร์ ตอนเปิดหน้า ตอนเปลี่ยนหน้า และทุก PULSE_INTERVAL_MS
 * จำนวนที่ได้เป็นค่าที่นับใหม่ทั้งหมดทุกรอบ รอบที่ถามไม่ได้จึงไม่ทำให้นับซ้ำหรือนับขาด (NTF-015)
 */
export function usePulse(sinceId: number, onPulse: (pulse: Pulse) => void): void {
  const pathname = usePathname();
  const ask = useEffectEvent(async () => {
    const pulse = await askPulse(notificationPulseAction, sinceId);
    if (pulse) onPulse(pulse);
  });
  useEffect(() => {
    void ask();
    const timer = setInterval(() => void ask(), PULSE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [pathname]);
}
