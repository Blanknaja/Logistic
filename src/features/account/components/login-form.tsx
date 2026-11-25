"use client";

import { logInAction } from "@/features/account/actions";
import { ActionForm, Field } from "@/shared/ui/action-form";

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
          <input type="hidden" name="next" value={next} />
          <Field label="อีเมล" name="email" type="email" autoComplete="username" />
          <Field label="รหัสผ่าน" name="password" type="password" autoComplete="current-password" />
          {/* ผิดได้ทั้งอีเมลและรหัสผ่าน หรือถูกพักการเข้าสู่ระบบ จึงอยู่ใต้ช่องสุดท้าย ไม่ผูกกับช่องใดช่องหนึ่ง */}
          {"error" in state && state.error && (
            <p role="alert" className="field-error">
              {state.error}
            </p>
          )}
        </>
      )}
    </ActionForm>
  );
}
