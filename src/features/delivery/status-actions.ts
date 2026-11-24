"use server";

import { redirect } from "next/navigation";
import { loginPath } from "@/features/account/server/login-path";
import { changeParcelStatus, type StatusChangeProblem } from "@/features/delivery/server/parcel-status";
import { getDb } from "@/shared/db";
import { getCurrentAccount } from "@/shared/session";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** ฟอร์มของหน้า /parcels/[trackingNo] บันทึกได้แล้วพากลับหน้าเดิมพร้อม "บันทึกแล้ว" */
export async function changeParcelStatusAction(formData: FormData): Promise<StatusChangeProblem> {
  const trackingNo = text(formData, "trackingNo");
  const page = `/parcels/${encodeURIComponent(trackingNo)}`;
  const viewer = await getCurrentAccount();
  if (!viewer) redirect(loginPath(page, "relogin"));

  const result = changeParcelStatus(getDb(), {
    trackingNo,
    actor: viewer,
    from: text(formData, "from"),
    to: text(formData, "to"),
    location: text(formData, "location"),
    receiverName: text(formData, "receiverName"),
    reason: text(formData, "reason"),
  });
  if (!result.ok) return { error: result.error, currentStatus: result.currentStatus, fieldErrors: result.fieldErrors };
  redirect(`${page}?saved=1`);
}
