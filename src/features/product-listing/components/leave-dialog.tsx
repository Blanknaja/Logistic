"use client";

import { useEffect, useRef } from "react";
import styles from "./product-listing.module.css";

/** ถามก่อนออกจากหน้าฟอร์มที่ยังไม่ได้บันทึก (PRD-014) */
export function LeaveDialog({ onLeave, onStay }: { onLeave: () => void; onStay: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="leave-title"
      onCancel={(event) => {
        event.preventDefault();
        onStay();
      }}
    >
      <p id="leave-title">ยังไม่ได้บันทึก ออกจากหน้านี้ใช่ไหม</p>
      <div className={styles.actions}>
        <button type="button" className="button" onClick={onStay} autoFocus>
          อยู่ต่อ
        </button>
        <button type="button" className="button button-secondary" onClick={onLeave}>
          ออกโดยไม่บันทึก
        </button>
      </div>
    </dialog>
  );
}
