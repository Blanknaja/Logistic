"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { newNotificationsText } from "./bell";
import styles from "./notification.module.css";
import { usePulse } from "./use-pulse";

/**
 * แถบ "มีแจ้งเตือนใหม่ N รายการ กดเพื่อแสดง" บนหน้าแจ้งเตือน (NTF-014)
 * รายการใหม่ไม่ถูกแทรกเอง รายการที่ผู้ใช้กำลังดูจึงไม่ขยับ sinceId คือรายการล่าสุดตอนเรนเดอร์หน้า
 */
export function NewNotificationsBanner({ sinceId }: { sinceId: number }) {
  const router = useRouter();
  const [count, setCount] = useState(0);
  usePulse(sinceId, (pulse) => setCount(pulse.newCount));
  if (count === 0) return null;

  function show() {
    router.push("/notifications");
    router.refresh();
  }

  return (
    <button type="button" className={styles.banner} onClick={show}>
      {newNotificationsText(count)} กดเพื่อแสดง
    </button>
  );
}
