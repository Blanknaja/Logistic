import Link from "next/link";
import { notificationHref, type NotificationItem } from "@/features/notification/server/notifications";
import { formatThaiDateTime } from "@/shared/format";
import styles from "./notification.module.css";

/** รายการแจ้งเตือน ใช้ทั้งใต้กระดิ่งและในหน้าแจ้งเตือน กดแล้วเป็นอ่านแล้วและไปหน้าที่เกี่ยวข้อง (NTF-004) */
export function NotificationItems({ items }: { items: NotificationItem[] }) {
  return (
    <ul className={styles.list}>
      {items.map((item) => (
        <li key={item.id}>
          {/* เปิดลิงก์นี้คือการอ่าน จึงห้ามโหลดล่วงหน้า */}
          <Link href={notificationHref(item.id)} prefetch={false} className={item.read ? styles.item : `${styles.item} ${styles.unread}`}>
            <span className={styles.dot} aria-hidden="true" />
            <span className={styles.message}>
              {!item.read && <span className="visually-hidden">ยังไม่อ่าน </span>}
              {item.message}
            </span>
            <time dateTime={item.createdAt} className={styles.time}>
              {formatThaiDateTime(item.createdAt)}
            </time>
          </Link>
        </li>
      ))}
    </ul>
  );
}
