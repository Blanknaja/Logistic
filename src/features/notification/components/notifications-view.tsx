import Link from "next/link";
import { NO_NOTIFICATIONS, type NotificationPage } from "@/features/notification/server/notifications";
import { EmptyState } from "@/shared/ui/states";
import { MarkAllRead } from "./mark-all-read";
import { NewNotificationsBanner } from "./new-notifications-banner";
import { NotificationItems } from "./notification-items";
import styles from "./notification.module.css";

const pageHref = (page: number) => (page > 1 ? `/notifications?page=${page}` : "/notifications");

/** ปุ่มหน้าก่อนหน้าและหน้าถัดไป ปุ่มที่ไปต่อไม่ได้ยังแสดงแต่กดไม่ได้ (NTF-003) */
function PageLink({ label, page, enabled }: { label: string; page: number; enabled: boolean }) {
  return enabled ? (
    <Link href={pageHref(page)} className="button button-secondary">
      {label}
    </Link>
  ) : (
    <button type="button" className="button button-secondary" disabled>
      {label}
    </button>
  );
}

/** หน้าแจ้งเตือน (NTF-003 NTF-005 NTF-017) */
export function NotificationsView({ list }: { list: NotificationPage }) {
  return (
    <>
      <h1>แจ้งเตือน</h1>
      <div className={styles.toolbar}>
        <p>{`ยังไม่อ่าน ${list.unread} รายการ`}</p>
        <MarkAllRead disabled={list.unread === 0} />
      </div>
      <NewNotificationsBanner key={list.latestId} sinceId={list.latestId} />
      {list.total === 0 ? <EmptyState title={NO_NOTIFICATIONS} /> : <NotificationItems items={list.items} />}
      {list.pageCount > 1 && (
        <nav aria-label="เลือกหน้า" className={styles.pager}>
          <PageLink label="ก่อนหน้า" page={list.page - 1} enabled={list.page > 1} />
          <span>{`หน้า ${list.page} จาก ${list.pageCount}`}</span>
          <PageLink label="ถัดไป" page={list.page + 1} enabled={list.page < list.pageCount} />
        </nav>
      )}
    </>
  );
}
