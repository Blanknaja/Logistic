"use client";

import Link from "next/link";
import { saveProfileAction } from "@/features/account/actions";
import { ActionForm, Field } from "@/shared/ui/action-form";

export function ProfileForm({ displayName, phone }: { displayName: string; phone: string }) {
  return (
    <ActionForm
      action={saveProfileAction}
      initialState={{ errors: {} }}
      label="บันทึก"
      pendingLabel="กำลังบันทึก..."
      secondary={
        <Link href="/profile" className="button button-secondary">
          ยกเลิก
        </Link>
      }
    >
      {(state) => {
        const errors = "errors" in state ? state.errors : {};
        return (
          <>
            <Field
              label="ชื่อที่แสดง"
              name="displayName"
              defaultValue={displayName}
              autoComplete="nickname"
              error={errors.displayName}
            />
            <Field
              label="เบอร์โทร"
              name="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="เช่น 0812345678"
              defaultValue={phone}
              error={errors.phone}
            />
          </>
        );
      }}
    </ActionForm>
  );
}
