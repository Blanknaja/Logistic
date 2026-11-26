import type { CurrentAccount } from "@/features/account/server/sessions";
import { bellStart } from "@/features/notification/nav";
import { Bell } from "./bell";

/** กระดิ่งของบัญชีที่เข้าสู่ระบบอยู่ คนที่ยังไม่เข้าสู่ระบบไม่เห็นกระดิ่ง (NTF-001) */
export function NotificationBell({ viewer }: { viewer: CurrentAccount | null }) {
  return viewer ? <Bell start={bellStart(viewer)} /> : null;
}
