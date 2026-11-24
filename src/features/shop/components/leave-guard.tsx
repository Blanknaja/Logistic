"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import styles from "./shop.module.css";

export const LEAVE_QUESTION = "ยังไม่ได้บันทึก ต้องการออกจากหน้านี้ไหม";

type LinkClick = { button: number; modified: boolean; target: string; href: string | null };

/**
 * ที่อยู่ในเว็บนี้ที่ลิงก์จะพาไป ซึ่งต้องถามก่อนออก
 * null เมื่อไม่ต้องถาม เช่น เปิดแท็บใหม่ หรือไปเว็บอื่นซึ่งเบราว์เซอร์ถามเองผ่าน beforeunload
 */
export function guardedHref(click: LinkClick, origin: string): string | null {
  if (click.button !== 0 || click.modified || !click.href) return null;
  if (click.target && click.target !== "_self") return null;
  const url = new URL(click.href, origin);
  return url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : null;
}

/** ถามยืนยันก่อนออกจากหน้าที่มีข้อมูลยังไม่บันทึก (SHP-010) */
export function LeaveGuard({ when }: { when: boolean }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    if (!when) return;
    const onClick = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a") : null;
      if (!link) return;
      const target = guardedHref(
        {
          button: event.button,
          modified: event.metaKey || event.ctrlKey || event.shiftKey || event.altKey,
          target: link.target,
          href: link.getAttribute("href"),
        },
        window.location.origin,
      );
      if (!target) return;
      // ดักก่อน Link ของ Next.js จะพาไปหน้าใหม่
      event.preventDefault();
      event.stopPropagation();
      setHref(target);
      dialog.current?.showModal();
    };
    // ปิดแท็บ โหลดหน้าใหม่ หรือไปเว็บอื่น เบราว์เซอร์ถามด้วยข้อความของตัวเอง
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [when]);

  return (
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="leave-question">
      <p id="leave-question">{LEAVE_QUESTION}</p>
      <div className={styles.actions}>
        <button type="button" className="button" onClick={() => dialog.current?.close()}>
          อยู่ต่อ
        </button>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => {
            dialog.current?.close();
            if (href) router.push(href);
          }}
        >
          ออก
        </button>
      </div>
    </dialog>
  );
}
