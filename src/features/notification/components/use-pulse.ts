"use client";

import { usePathname } from "next/navigation";
import { useEffect, useEffectEvent } from "react";
import { notificationPulseAction } from "@/features/notification/actions";
import type { Pulse } from "@/features/notification/server/notifications";

/** ถามทุก 5 วินาที หน้าที่เปิดค้างจึงเห็นแจ้งเตือนใหม่ภายใน 10 วินาที (NTF-014 NTF-Q02) */
export const PULSE_INTERVAL_MS = 5_000;

type Ask = (sinceIds: number[]) => Promise<Pulse[] | null>;

/** ถามหนึ่งรอบ เน็ตหลุด เซิร์ฟเวอร์ไม่ตอบ หรือออกจากระบบแล้วได้ null หน้าจึงแสดงค่าล่าสุดที่รู้ต่อไป (NTF-015) */
export async function askPulse(ask: Ask, sinceIds: number[]): Promise<Pulse[] | null> {
  try {
    return await ask(sinceIds);
  } catch {
    return null;
  }
}

/** component หนึ่งตัวที่รอผลของรอบถาม sinceId คือรายการล่าสุดที่ตัวนั้นรู้ตอนถาม */
type PulseListener = { sinceId: () => number; onPulse: (pulse: Pulse) => void };

type Visibility = Pick<Document, "hidden"> & {
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
};

/**
 * รอบถามเดียวของทั้งหน้า ทุก component ที่ subscribe ได้คำตอบจากคำขอเดียวกัน
 * แท็บที่ถูกซ่อนไม่ถาม กลับมาแสดงแล้วถามทันทีหนึ่งครั้งและถามต่อทุก PULSE_INTERVAL_MS
 */
export function createPulsePoller(ask: Ask, page: Visibility) {
  const listeners = new Set<PulseListener>();
  let timer: ReturnType<typeof setInterval> | undefined;
  let queued = false;

  async function round() {
    queued = false;
    const asked = [...listeners];
    if (asked.length === 0 || page.hidden) return;
    const pulses = await askPulse(ask, asked.map((listener) => listener.sinceId()));
    pulses?.forEach((pulse, index) => {
      if (listeners.has(asked[index])) asked[index].onPulse(pulse);
    });
  }

  /** ถามหนึ่งรอบโดยไม่รอรอบถัดไป หลาย component ที่ขอในจังหวะเดียวกันได้คำขอเดียว */
  function askSoon() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => void round());
  }

  function start() {
    askSoon();
    timer = setInterval(() => void round(), PULSE_INTERVAL_MS);
  }

  function stop() {
    clearInterval(timer);
    timer = undefined;
  }

  function onVisibilityChange() {
    stop();
    if (!page.hidden) start();
  }

  return {
    askSoon,
    subscribe(listener: PulseListener): () => void {
      listeners.add(listener);
      if (listeners.size === 1) {
        page.addEventListener("visibilitychange", onVisibilityChange);
        if (!page.hidden) start();
      } else askSoon();
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) return;
        stop();
        page.removeEventListener("visibilitychange", onVisibilityChange);
      };
    },
  };
}

let poller: ReturnType<typeof createPulsePoller> | undefined;

/**
 * เรียก onPulse ด้วยจำนวนล่าสุดจากเซิร์ฟเวอร์ ตอนเปิดหน้า ตอนเปลี่ยนหน้า ตอนแท็บกลับมาแสดง และทุก PULSE_INTERVAL_MS
 * จำนวนที่ได้เป็นค่าที่นับใหม่ทั้งหมดทุกรอบ รอบที่ถามไม่ได้จึงไม่ทำให้นับซ้ำหรือนับขาด (NTF-015)
 */
export function usePulse(sinceId: number, onPulse: (pulse: Pulse) => void): void {
  const pathname = usePathname();
  const since = useEffectEvent(() => sinceId);
  const deliver = useEffectEvent(onPulse);
  useEffect(() => {
    poller ??= createPulsePoller(notificationPulseAction, document);
    return poller.subscribe({ sinceId: () => since(), onPulse: (pulse) => deliver(pulse) });
  }, []);
  useEffect(() => {
    poller?.askSoon();
  }, [pathname]);
}
