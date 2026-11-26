// ข้อความและตัวช่วยของแจ้งเตือนที่ใช้ทั้งฝั่งเซิร์ฟเวอร์และในเบราว์เซอร์ (NTF)

export const NOTIFICATION_NOT_FOUND = "ไม่พบแจ้งเตือน";
export const NO_NOTIFICATIONS = "ยังไม่มีแจ้งเตือน";
export const NOTIFICATIONS_LOAD_FAILED = "โหลดแจ้งเตือนไม่สำเร็จ";
export const MARK_ALL_READ = "อ่านทั้งหมดแล้ว";

/** ที่อยู่ที่กดแล้วเปิดแจ้งเตือน: เปลี่ยนเป็นอ่านแล้ว แล้วพาไปหน้าที่เกี่ยวข้อง (NTF-004) */
export const notificationHref = (id: number) => `/notifications/${id}`;

/** ตัวเลขที่กระดิ่ง ไม่มีตัวเลขเมื่อเป็น 0 (NTF-001) */
export const badgeText = (unread: number) => (unread > 99 ? "99+" : unread > 0 ? String(unread) : "");

/** ชื่อของกระดิ่งที่โปรแกรมอ่านจอได้ยิน (NTF-001) */
export const bellLabel = (unread: number) => (unread > 0 ? `แจ้งเตือน ยังไม่อ่าน ${unread} รายการ` : "แจ้งเตือน");
