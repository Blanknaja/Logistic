"use client";

import { requestPasswordResetAction } from "@/features/account/actions";
import { ActionForm, Field } from "./action-form";
import styles from "./account.module.css";

export function ForgotPasswordForm() {
  return (
    <ActionForm
      action={requestPasswordResetAction}
      initialState={{ notice: null }}
      label="ส่งลิงก์"
      pendingLabel="กำลังส่ง..."
    >
      {(state) => (
        <>
          {"notice" in state && state.notice && (
            <p role="status" className={styles.notice}>
              {state.notice}
            </p>
          )}
          <Field label="อีเมล" name="email" type="email" autoComplete="email" />
        </>
      )}
    </ActionForm>
  );
}
