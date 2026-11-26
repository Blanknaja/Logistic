import Link from "next/link";
import { NOTIFICATION_NOT_FOUND } from "@/features/notification/server/notifications";
import { NotFoundState } from "@/shared/ui/states";

// แจ้งเตือนที่ไม่มีอยู่และของบัญชีอื่นแสดงหน้าเดียวกัน (NTF-004 NTF-016)
export default function NotificationNotFound() {
  return (
    <NotFoundState title={NOTIFICATION_NOT_FOUND}>
      <Link href="/notifications" className="button">
        กลับไปหน้าแจ้งเตือน
      </Link>
    </NotFoundState>
  );
}
