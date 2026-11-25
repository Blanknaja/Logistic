"use client";

import { useFormStatus } from "react-dom";
import { SubmitButton } from "@/shared/ui/action-form";

export function LogoutButton() {
  const { pending } = useFormStatus();
  return <SubmitButton pending={pending} label="ออกจากระบบ" pendingLabel="กำลังออกจากระบบ..." secondary />;
}
