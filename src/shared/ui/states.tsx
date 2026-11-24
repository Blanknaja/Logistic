import Link from "next/link";
import type { ReactNode } from "react";
import { RetryButton } from "./retry-button";

// รูปแบบกลางของหน้าว่าง หน้ากำลังโหลด หน้าผิดพลาด และหน้า "ไม่พบ" ทุก feature ใช้ชุดนี้

type StateProps = {
  title: string;
  message?: string;
  children?: ReactNode;
};

function StateBox({ title, message, children, role }: StateProps & { role?: "status" | "alert" }) {
  return (
    <section className="state" role={role}>
      <h2 className="state-title">{title}</h2>
      {message && <p className="state-message">{message}</p>}
      {children && <div className="state-actions">{children}</div>}
    </section>
  );
}

/** ไม่มีข้อมูลให้แสดง ส่งปุ่มหรือลิงก์ที่พาไปทำต่อเป็น children */
export function EmptyState(props: StateProps) {
  return <StateBox {...props} />;
}

/** ใช้ใน loading.tsx หรือ Suspense fallback */
export function LoadingState({ title = "กำลังโหลด" }: { title?: string }) {
  return <StateBox title={title} role="status" />;
}

/** โหลดไม่สำเร็จ ปุ่มเริ่มต้นจะโหลดข้อมูลของหน้าเดิมใหม่โดยคงที่อยู่หน้าเว็บไว้ */
export function ErrorState({
  title = "โหลดข้อมูลไม่สำเร็จ",
  message,
  action = <RetryButton />,
}: {
  title?: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <StateBox title={title} message={message} role="alert">
      {action}
    </StateBox>
  );
}

/** ข้อมูลไม่มีอยู่ หรือเป็นของคนอื่น ทั้งสองกรณีแสดงหน้าเดียวกัน */
export function NotFoundState({ title = "ไม่พบ", message }: { title?: string; message?: string }) {
  return (
    <StateBox title={title} message={message}>
      <Link href="/" className="button">
        กลับหน้าแรก
      </Link>
    </StateBox>
  );
}
