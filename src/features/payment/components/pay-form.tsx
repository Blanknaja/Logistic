"use client";

import { startTransition, useActionState, useEffect, useRef, type ReactNode } from "react";
import { withTimeout } from "@/features/account/components/action-form";
import type { PayFormState } from "@/features/payment/actions";
import styles from "./payment.module.css";

/** เซิร์ฟเวอร์รอผู้ให้บริการ 10 วินาที ฝั่งเบราว์เซอร์รออีกนิดเผื่อเน็ตช้า ผู้ซื้อต้องเห็นผลภายใน 11 วินาที (PAY-Q02) */
export const CLIENT_TIMEOUT_MS = 11_000;

/**
 * ฟอร์มของหน้าจ่ายเงิน ระหว่างรอผลกดซ้ำไม่ได้ (PAY-009)
 * ช่องที่กรอกไว้อยู่ครบเมื่อมีข้อความผิดพลาด ไม่ล้างเหมือน form action ปกติของ React (PAY-003)
 */
export function PayForm({
  action,
  groupId,
  label,
  pendingLabel,
  failedMessage,
  secondary = false,
  children,
}: {
  action: (formData: FormData) => Promise<PayFormState>;
  groupId: number;
  label: string;
  pendingLabel: string;
  /** ข้อความเมื่อเน็ตหลุดหรือเซิร์ฟเวอร์ไม่ตอบ */
  failedMessage: string;
  secondary?: boolean;
  children?: (state: PayFormState) => ReactNode;
}) {
  const [state, dispatch, pending] = useActionState(withTimeout(action, CLIENT_TIMEOUT_MS), {});
  const form = useRef<HTMLFormElement>(null);
  // pending จะเป็น true หลัง React วาดใหม่ ส่วนนี้กันการกดซ้ำที่มาก่อนนั้น
  const busy = useRef(false);
  useEffect(() => {
    if (!pending) busy.current = false;
  }, [pending]);

  const failed = "failed" in state;
  const result: PayFormState = failed ? {} : state;
  const message = failed ? failedMessage : result.message;

  return (
    <form
      ref={form}
      method="post"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (busy.current) return;
        busy.current = true;
        const formData = new FormData(event.currentTarget);
        startTransition(() => dispatch(formData));
      }}
    >
      <input type="hidden" name="groupId" value={groupId} />
      {children?.(result)}
      {message && (
        <div role="alert" className={styles.alert}>
          <p>{message}</p>
          {(failed || result.retry) && (
            <button type="button" className="button button-secondary" disabled={pending} onClick={() => form.current?.requestSubmit()}>
              ลองใหม่
            </button>
          )}
        </div>
      )}
      <button type="submit" className={secondary ? "button button-secondary" : "button"} disabled={pending}>
        {pending ? pendingLabel : label}
      </button>
    </form>
  );
}
