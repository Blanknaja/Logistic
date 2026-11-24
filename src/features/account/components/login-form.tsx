"use client";

import { logInAction } from "@/features/account/actions";
import { ActionForm, Field } from "./action-form";

export function LoginForm({ next }: { next: string }) {
  return (
    <ActionForm
      action={logInAction}
      initialState={{ error: null }}
      label="เข้าสู่ระบบ"
      pendingLabel="กำลังเข้าสู่ระบบ..."
      clearOnResult="password"
    >
      {(state) => (
        <>
          {"error" in state && state.error && (
            <p role="alert" className="field-error">
              {state.error}
            </p>
          )}
          <input type="hidden" name="next" value={next} />
          <Field label="อีเมล" name="email" type="email" autoComplete="username" />
          <Field label="รหัสผ่าน" name="password" type="password" autoComplete="current-password" />
        </>
      )}
    </ActionForm>
  );
}
