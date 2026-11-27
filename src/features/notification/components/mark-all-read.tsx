"use client";

import { useState, useTransition, type FormEvent } from "react";
import { markAllReadAction } from "@/features/notification/actions";
import { MARK_ALL_READ } from "@/features/notification/rules";
import { SAVE_FAILED, settle } from "@/shared/ui/timeout";
import styles from "./notification.module.css";

/** กดหนึ่งครั้ง ได้ true เมื่อบันทึกแล้ว false เมื่อเน็ตหลุด เซิร์ฟเวอร์ผิดพลาด หรือไม่ได้ผลภายใน 10 วินาที */
export async function saveAllRead(save: () => Promise<void>): Promise<boolean> {
  const result = await settle(save());
  return result === undefined;
}

/**
 * ปุ่ม "อ่านทั้งหมดแล้ว" (NTF-005) บันทึกไม่สำเร็จได้ข้อความกับปุ่มลองใหม่ โดยสถานะของแจ้งเตือนไม่เปลี่ยน
 * เป็นฟอร์มของ server action จึงกดได้แม้สคริปต์ของหน้าไม่ทำงาน
 */
export function MarkAllRead({ disabled, onDone }: { disabled: boolean; onDone?: () => void }) {
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const saved = await saveAllRead(markAllReadAction);
      startTransition(() => setFailed(!saved));
      if (saved) onDone?.();
    });
  }

  return (
    <form action={markAllReadAction} onSubmit={submit} className={styles.markAll}>
      {failed && (
        <p role="alert" className={styles.failed}>
          {SAVE_FAILED}
          <button type="submit" className="link-action" disabled={pending}>
            ลองใหม่
          </button>
        </p>
      )}
      <button type="submit" className="button button-secondary" disabled={disabled || pending}>
        {MARK_ALL_READ}
      </button>
    </form>
  );
}
