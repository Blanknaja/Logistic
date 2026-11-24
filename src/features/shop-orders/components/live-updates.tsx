"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { shopOrdersVersionAction } from "@/features/shop-orders/actions";
import { formatDateTime } from "@/shared/format";
import styles from "./shop-orders.module.css";

/** ถามทุก 10 วินาที หน้าที่เปิดค้างจึงเห็นการเปลี่ยนแปลงภายใน 30 วินาที (ORD-Q02) */
export const POLL_INTERVAL_MS = 10_000;

/** ถามหนึ่งรอบว่าข้อมูลของร้านต่างจากที่หน้าเรนเดอร์ไว้ไหม เน็ตหลุดหรือเซิร์ฟเวอร์ไม่ตอบได้ "failed" */
export async function checkForUpdates(check: () => Promise<string>, version: string): Promise<"same" | "changed" | "failed"> {
  try {
    return (await check()) === version ? "same" : "changed";
  } catch {
    return "failed";
  }
}

export function StaleNotice({ since }: { since: number }) {
  return (
    <p role="status" className={styles.notice}>
      อัปเดตข้อมูลไม่ได้ ข้อมูลที่เห็นเป็นของเวลา {formatDateTime(new Date(since)).slice(-5)}
    </p>
  );
}

/**
 * ทำให้หน้าที่เปิดค้างอัปเดตเอง (ORD-010 ORD-011)
 * เมื่อข้อมูลของร้านเปลี่ยนจะโหลดหน้าเดิมใหม่ ซึ่งรวมเมนู "รอจัดของ" ใน layout ด้วย
 * asOf ถูกใส่ในที่อยู่หน้าเว็บ การโหลดใหม่จึงไม่แทรกคำสั่งซื้อใหม่เข้ารายการที่ผู้ขายกำลังดู
 */
export function LiveUpdates({ version, asOf }: { version: string; asOf?: number }) {
  const router = useRouter();
  const freshAt = useRef(0);
  const [staleSince, setStaleSince] = useState<number | null>(null);

  useEffect(() => {
    if (freshAt.current === 0) freshAt.current = Date.now();
    if (asOf === undefined) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("asOf") !== String(asOf)) {
      url.searchParams.set("asOf", String(asOf));
      window.history.replaceState(null, "", url);
    }
  });

  useEffect(() => {
    const timer = setInterval(async () => {
      const result = await checkForUpdates(shopOrdersVersionAction, version);
      if (result === "failed") {
        setStaleSince(freshAt.current);
        return;
      }
      freshAt.current = Date.now();
      setStaleSince(null);
      if (result === "changed") router.refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [version, router]);

  return staleSince === null ? null : <StaleNotice since={staleSince} />;
}
