"use client";

import { startTransition, useActionState, useRef } from "react";
import { withTimeout } from "@/shared/ui/timeout";
import styles from "./tracking.module.css";

export const SAVE_FAILED = "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง";

type State = { error: string | null };

/** ปุ่ม "ได้รับสินค้าแล้ว" พร้อมหน้าต่างถามยืนยันหนึ่งครั้ง (DLV-012) */
export function ConfirmReceipt({
  trackingNo,
  action,
}: {
  trackingNo: string;
  action: (formData: FormData) => Promise<State>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, dispatch, pending] = useActionState(withTimeout(action), { error: null });

  const send = () => {
    dialog.current?.close();
    const data = new FormData();
    data.set("trackingNo", trackingNo);
    startTransition(() => dispatch(data));
  };

  return (
    <div className={styles.receipt}>
      <button type="button" className="button" disabled={pending} onClick={() => dialog.current?.showModal()}>
        {pending ? "กำลังบันทึก" : "ได้รับสินค้าแล้ว"}
      </button>
      {"failed" in state ? (
        <div role="alert">
          <p className="field-error">{SAVE_FAILED}</p>
          <button type="button" className="button button-secondary" disabled={pending} onClick={send}>
            ลองใหม่
          </button>
        </div>
      ) : (
        state.error && (
          <p role="alert" className="field-error">
            {state.error}
          </p>
        )
      )}
      <dialog ref={dialog} aria-labelledby="confirm-receipt-title" className={styles.dialog}>
        <h2 id="confirm-receipt-title">ยืนยันว่าได้รับสินค้าแล้ว</h2>
        <p>กดยืนยันแล้วยกเลิกไม่ได้ และคำสั่งซื้อจะเป็น สำเร็จ</p>
        <div className={styles.actions}>
          <button type="button" className="button" onClick={send}>
            ยืนยัน
          </button>
          <button type="button" className="button button-secondary" onClick={() => dialog.current?.close()}>
            ยกเลิก
          </button>
        </div>
      </dialog>
    </div>
  );
}
