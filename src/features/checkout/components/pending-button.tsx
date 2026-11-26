"use client";

import { useFormStatus } from "react-dom";

const CLASS_NAMES = { primary: "button", secondary: "button button-secondary", link: "link-action" };

/** ปุ่มส่งของฟอร์มที่ใช้ server action ตรงๆ ระหว่างรอผลกดซ้ำไม่ได้ การกระทำรองในแถวรายการใช้ variant="link" */
export function PendingButton({
  label,
  pendingLabel,
  variant = "primary",
}: {
  label: string;
  pendingLabel: string;
  variant?: keyof typeof CLASS_NAMES;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={CLASS_NAMES[variant]} disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}
