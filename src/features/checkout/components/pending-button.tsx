"use client";

import { useFormStatus } from "react-dom";
import { SubmitButton } from "@/features/account/components/action-form";

/** ปุ่มส่งของฟอร์มที่ใช้ server action ตรงๆ ระหว่างรอผลกดซ้ำไม่ได้ */
export function PendingButton(props: { label: string; pendingLabel: string; secondary?: boolean }) {
  const { pending } = useFormStatus();
  return <SubmitButton pending={pending} {...props} />;
}
