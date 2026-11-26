import { notFound, redirect } from "next/navigation";
import { openNotification } from "@/features/notification/server/notifications";
import { getDb } from "@/shared/db";
import { requireAccount } from "@/shared/session";

/** กดแจ้งเตือนหนึ่งรายการ: เป็นอ่านแล้ว แล้วไปหน้าที่เกี่ยวข้อง ของบัญชีอื่นได้หน้า "ไม่พบแจ้งเตือน" (NTF-004 NTF-016) */
export default async function OpenNotificationPage({ params }: PageProps<"/notifications/[id]">) {
  const { id } = await params;
  const viewer = await requireAccount(`/notifications/${encodeURIComponent(id)}`);
  const href = /^\d+$/.test(id) ? openNotification(getDb(), viewer.id, Number(id)) : null;
  if (!href) notFound();
  redirect(href);
}
