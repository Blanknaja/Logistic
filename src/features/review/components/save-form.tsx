"use client";

import { startTransition, useActionState, useEffect, useRef, type ReactNode } from "react";
import { SubmitButton } from "@/shared/ui/action-form";
import { SAVE_FAILED, settle, type Failed } from "@/shared/ui/timeout";
import styles from "./review.module.css";

/** server action ของฟอร์มรีวิว รับผลครั้งก่อนเป็นตัวแรกแบบ useActionState */
export type SaveAction<S> = (previous: S, formData: FormData) => Promise<S>;

export type Save<S> = {
  /** ผลล่าสุดของฟอร์ม หรือ { failed: true } เมื่อบันทึกไม่สำเร็จหรือเกิน 10 วินาที */
  state: S | Failed;
  formAction: (formData: FormData) => void;
  dispatch: (formData: FormData) => void;
  pending: boolean;
};

/**
 * สถานะของฟอร์มรีวิวหนึ่งฟอร์ม ใช้ได้สองทาง
 * React ทำงานอยู่: ส่งผ่าน dispatch ช่องที่กรอกไม่ถูกล้าง และรอผลไม่เกิน 10 วินาที onResult ถูกเรียกเมื่อได้ผลจากเซิร์ฟเวอร์
 * สคริปต์ของหน้าไม่ทำงาน: เบราว์เซอร์ส่งฟอร์มไปที่ formAction เอง แล้วหน้าที่ตอบกลับมีผลของ action อยู่ใน state
 */
export function useSave<S extends object>(action: SaveAction<S>, initialState: S, onResult?: (state: S) => void): Save<S> {
  const [posted, formAction] = useActionState(action, initialState as Awaited<S>);
  const [live, dispatch, pending] = useActionState<S | Failed | null, FormData>(async (_previous, formData) => {
    const result = await settle(action(initialState, formData));
    if (!("failed" in result)) onResult?.(result);
    return result;
  }, null);
  return { state: live ?? posted, formAction, dispatch, pending };
}

/**
 * ฟอร์มของรีวิว คำตอบของร้าน และการซ่อน ระหว่างรอผลกดซ้ำไม่ได้
 * บันทึกไม่สำเร็จหรือเกิน 10 วินาที แสดง "บันทึกไม่สำเร็จ" พร้อมปุ่ม "ลองใหม่" โดยสิ่งที่กรอกไว้ยังอยู่ครบ (REV-018)
 * เป็นฟอร์มของ server action จึงส่งได้แม้สคริปต์ของหน้าไม่ทำงาน
 */
export function SaveForm<S extends object>({
  save,
  label,
  pendingLabel,
  disabled = false,
  secondary = false,
  extra,
  children,
}: {
  save: Save<S>;
  label: string;
  pendingLabel: string;
  /** ยังส่งไม่ได้ เช่นรูปยังส่งขึ้นเซิร์ฟเวอร์ไม่เสร็จ */
  disabled?: boolean;
  secondary?: boolean;
  /** ลิงก์หรือปุ่มข้างปุ่มส่ง */
  extra?: ReactNode;
  children?: (state: S | Failed) => ReactNode;
}) {
  const { state, formAction, dispatch, pending } = save;
  const form = useRef<HTMLFormElement>(null);
  // pending จะเป็น true หลัง React วาดใหม่ ส่วนนี้กันการกดซ้ำที่มาก่อนนั้น
  const busy = useRef(false);

  useEffect(() => {
    if (!pending) busy.current = false;
  }, [pending]);

  return (
    <form
      ref={form}
      action={formAction}
      noValidate
      className={styles.form}
      onSubmit={(event) => {
        // ไม่ให้ React ส่งผ่าน prop action เพราะ React จะล้างทุกช่องหลังส่งเสร็จ
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
          <p>{SAVE_FAILED}</p>
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
