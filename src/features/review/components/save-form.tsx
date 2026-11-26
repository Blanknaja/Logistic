"use client";

import { startTransition, useActionState, useEffect, useRef, type ReactNode } from "react";
import { MESSAGES } from "@/features/review/rules";
import { SubmitButton } from "@/shared/ui/action-form";
import { withTimeout, type Failed } from "@/shared/ui/timeout";
import styles from "./review.module.css";

/**
 * ฟอร์มของรีวิว คำตอบของร้าน และการซ่อน ระหว่างรอผลกดซ้ำไม่ได้
 * บันทึกไม่สำเร็จหรือเกิน 10 วินาที แสดง "บันทึกไม่สำเร็จ" พร้อมปุ่ม "ลองใหม่" โดยสิ่งที่กรอกไว้ยังอยู่ครบ (REV-018)
 */
export function SaveForm<S extends object>({
  action,
  initialState,
  label,
  pendingLabel,
  disabled = false,
  secondary = false,
  extra,
  children,
}: {
  action: (formData: FormData) => Promise<S>;
  initialState: S;
  label: string;
  pendingLabel: string;
  /** ยังส่งไม่ได้ เช่นรูปยังส่งขึ้นเซิร์ฟเวอร์ไม่เสร็จ */
  disabled?: boolean;
  secondary?: boolean;
  /** ลิงก์หรือปุ่มข้างปุ่มส่ง */
  extra?: ReactNode;
  children?: (state: S | Failed) => ReactNode;
}) {
  const [state, dispatch, pending] = useActionState<S | Failed, FormData>(withTimeout(action), initialState as Awaited<S>);
  const form = useRef<HTMLFormElement>(null);
  // pending จะเป็น true หลัง React วาดใหม่ ส่วนนี้กันการกดซ้ำที่มาก่อนนั้น
  const busy = useRef(false);

  useEffect(() => {
    if (!pending) busy.current = false;
  }, [pending]);

  return (
    <form
      ref={form}
      method="post"
      noValidate
      className={styles.form}
      onSubmit={(event) => {
        // ไม่ใช้ prop action ของ form เพราะ React จะล้างทุกช่องหลังส่งเสร็จ
        event.preventDefault();
        if (busy.current || disabled) return;
        busy.current = true;
        const formData = new FormData(event.currentTarget);
        startTransition(() => dispatch(formData));
      }}
    >
      {children?.(state)}
      {"failed" in state && (
        <div role="alert" className={styles.failed}>
          <p>{MESSAGES.saveFailed}</p>
          <button type="button" className="button button-secondary" disabled={pending} onClick={() => form.current?.requestSubmit()}>
            ลองใหม่
          </button>
        </div>
      )}
      <div className={styles.actions}>
        <SubmitButton pending={pending || disabled} label={label} pendingLabel={pending ? pendingLabel : label} secondary={secondary} />
        {extra}
      </div>
    </form>
  );
}
