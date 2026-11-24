"use client";

import { resetPasswordAction } from "@/features/account/actions";
import { ActionForm, Field } from "./action-form";

export function ResetPasswordForm({ token }: { token: string }) {
  return (
    <ActionForm action={resetPasswordAction} initialState={{ errors: {} }} label="บันทึก" pendingLabel="กำลังบันทึก...">
      {(state) => (
        <>
          <input type="hidden" name="token" value={token} />
          <Field
            label="รหัสผ่านใหม่"
            name="password"
            type="password"
            autoComplete="new-password"
            error={"errors" in state ? state.errors.password : undefined}
          />
        </>
      )}
    </ActionForm>
  );
}
