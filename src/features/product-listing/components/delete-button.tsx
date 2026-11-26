"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./product-listing.module.css";

/**
 * หน้าต่างถามยืนยันก่อนลบ กด "ยกเลิก" หรือ Escape แล้วไม่มีอะไรเปลี่ยน (PRD-009)
 * ปิดด้วย close() ก่อนแล้วจึงเรียก onCancel เบราว์เซอร์จึงพาโฟกัสกลับไปปุ่มที่เปิดหน้าต่าง
 */
export function DeleteDialog({ name, action, onCancel }: { name: string; action: () => Promise<void>; onCancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="delete-title" onClose={onCancel}>
      <p id="delete-title" className={styles.dialogTitle}>
        ลบ {name} ใช่ไหม
      </p>
      <p className={styles.dialogText}>ลบแล้วกู้กลับไม่ได้</p>
      <form action={action} className={styles.actions}>
        <button type="button" className="button" onClick={() => dialog.current?.close()} autoFocus>
          ยกเลิก
        </button>
        <button type="submit" className="button button-secondary">
          ลบ
        </button>
      </form>
    </dialog>
  );
}

/** ลิงก์ "ลบสินค้านี้" ในหน้าแก้ไข เปิดหน้าต่างถามยืนยันก่อนลบ */
export function DeleteButton({ name, action }: { name: string; action: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="link-action" onClick={() => setOpen(true)}>
        ลบสินค้านี้
      </button>
      {open && <DeleteDialog name={name} action={action} onCancel={() => setOpen(false)} />}
    </>
  );
}
