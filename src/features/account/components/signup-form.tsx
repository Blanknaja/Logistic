"use client";

import { signUpAction } from "@/features/account/actions";
import { ActionForm, Field } from "./action-form";

export function SignupForm() {
  return (
    <ActionForm action={signUpAction} initialState={{ errors: {} }} label="สมัครบัญชี" pendingLabel="กำลังสมัคร...">
      {(state) => {
        const errors = "errors" in state ? state.errors : {};
        return (
          <>
            <Field label="อีเมล" name="email" type="email" autoComplete="email" error={errors.email} />
            <Field label="รหัสผ่าน" name="password" type="password" autoComplete="new-password" error={errors.password} />
            <Field label="ชื่อที่แสดง" name="displayName" autoComplete="nickname" error={errors.displayName} />
          </>
        );
      }}
    </ActionForm>
  );
}
