"use client";

import { unstable_rethrow } from "next/navigation";
import { startTransition, useActionState, useEffect, useRef, type InputHTMLAttributes, type ReactNode } from "react";
import styles from "./account.module.css";

export const ACTION_TIMEOUT_MS = 10_000;
export const ACTION_FAILED = "ทำรายการไม่สำเร็จ กรุณาลองใหม่";

export type Failed = { failed: true };

/** ห่อ server action ให้ได้ผล "ไม่สำเร็จ" เมื่อเน็ตหลุดหรือไม่ได้ผลใน 10 วินาที แทนการโยน error ทั้งหน้า (ACC-014) */
export function withTimeout<S>(action: (formData: FormData) => Promise<S>, ms = ACTION_TIMEOUT_MS) {
  return async (_previous: S | Failed, formData: FormData): Promise<S | Failed> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const running = action(formData);
    // ถ้าหมดเวลาไปก่อน ผลที่มาทีหลังไม่มีใครรอแล้ว
    running.catch(() => {});
    try {
      return await Promise.race([
        running,
        new Promise<Failed>((resolve) => {
          timer = setTimeout(() => resolve({ failed: true }), ms);
        }),
      ]);
    } catch (error) {
      // redirect() ของ server action มาในรูป error ต้องปล่อยให้ Next.js พาไปหน้าใหม่
      unstable_rethrow(error);
      return { failed: true };
    } finally {
      clearTimeout(timer);
    }
  };
}

export function SubmitButton({
  pending,
  label,
  pendingLabel,
  secondary = false,
}: {
  pending: boolean;
  label: string;
  pendingLabel: string;
  secondary?: boolean;
}) {
  return (
    <button type="submit" className={secondary ? "button button-secondary" : "button"} disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

export function Field({
  label,
  name,
  error,
  ...input
}: { label: string; name: string; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = `field-${name}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={name}
        className="input"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...input}
      />
      {error && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * ฟอร์มของ feature นี้ ระหว่างรอผลกดซ้ำไม่ได้
 * ข้อมูลที่กรอกอยู่ครบเมื่อทำรายการไม่สำเร็จ ยกเว้นช่อง clearOnResult ที่ล้างทุกครั้งที่ได้ผลกลับมา
 */
export function ActionForm<S extends object>({
  action,
  initialState,
  label,
  pendingLabel,
  clearOnResult,
  secondary,
  children,
}: {
  action: (formData: FormData) => Promise<S>;
  initialState: S;
  label: string;
  pendingLabel: string;
  clearOnResult?: string;
  secondary?: ReactNode;
  children: (state: S | Failed) => ReactNode;
}) {
  const [state, dispatch, pending] = useActionState<S | Failed, FormData>(
    withTimeout(action),
    initialState as Awaited<S>,
  );
  const form = useRef<HTMLFormElement>(null);
  // pending จะเป็น true หลัง React วาดใหม่ ส่วนนี้กันการกดซ้ำที่มาก่อนนั้น
  const busy = useRef(false);

  useEffect(() => {
    if (!pending) busy.current = false;
  }, [pending]);

  useEffect(() => {
    const input = clearOnResult ? form.current?.elements.namedItem(clearOnResult) : null;
    if (input instanceof HTMLInputElement && !("failed" in state)) input.value = "";
  }, [state, clearOnResult]);

  return (
    <form
      ref={form}
      // กดก่อนหน้าโหลดเสร็จ เบราว์เซอร์ส่งฟอร์มเอง ถ้าเป็น GET รหัสผ่านจะไปอยู่ในที่อยู่หน้าเว็บ
      method="post"
      noValidate
      onSubmit={(event) => {
        // ไม่ใช้ prop action ของ form เพราะ React จะล้างทุกช่องหลังส่งเสร็จ
        event.preventDefault();
        if (busy.current) return;
        busy.current = true;
        const formData = new FormData(event.currentTarget);
        startTransition(() => dispatch(formData));
      }}
    >
      {children(state)}
      {"failed" in state && (
        <div role="alert" className={styles.failed}>
          <p>{ACTION_FAILED}</p>
          <button
            type="button"
            className="button button-secondary"
            disabled={pending}
            onClick={() => form.current?.requestSubmit()}
          >
            ลองใหม่
          </button>
        </div>
      )}
      <div className={styles.actions}>
        <SubmitButton pending={pending} label={label} pendingLabel={pendingLabel} />
        {secondary}
      </div>
    </form>
  );
}
