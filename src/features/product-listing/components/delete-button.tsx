"use client";

import { useRef } from "react";
import styles from "./product-listing.module.css";

/** ปุ่ม "ลบ" ที่ถามยืนยันก่อน กด "ยกเลิก" แล้วไม่มีอะไรเปลี่ยน (PRD-009) */
export function DeleteButton({ name, action }: { name: string; action: () => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="button button-secondary" onClick={() => dialog.current?.showModal()}>
        ลบ
      </button>
      <dialog ref={dialog} className={styles.dialog} aria-label={`ลบ ${name}`}>
        <p>ลบ {name} ใช่ไหม ลบแล้วกู้กลับไม่ได้</p>
        <form action={action} className={styles.actions}>
          <button type="button" className="button" onClick={() => dialog.current?.close()} autoFocus>
            ยกเลิก
          </button>
          <button type="submit" className="button button-secondary">
            ลบ
          </button>
        </form>
      </dialog>
    </>
  );
}
