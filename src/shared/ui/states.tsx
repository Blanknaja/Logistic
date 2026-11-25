import Link from "next/link";
import type { ReactNode } from "react";
import { RetryButton } from "./retry-button";

// รูปแบบกลางของหน้าว่าง หน้ากำลังโหลด หน้าผิดพลาด และหน้า "ไม่พบ" ทุก feature ใช้ชุดนี้
// หัวข้อเป็น h1 เมื่อกล่องนี้คือเนื้อหาทั้งหน้า และ h2 เมื่อวางในหน้าที่มี h1 อยู่แล้ว ตาดูเหมือนกันทั้งสองแบบ

type Level = { level?: 1 | 2 };

type StateProps = {
  title: string;
  message?: string;
  children?: ReactNode;
};

function StateBox({ title, message, children, role, level }: StateProps & Required<Level> & { role?: "status" | "alert" }) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <section className="state" role={role}>
      <Heading className="state-title">{title}</Heading>
      {message && <p className="state-message">{message}</p>}
      {children && <div className="state-actions">{children}</div>}
    </section>
  );
}

/** ไม่มีข้อมูลให้แสดง ส่งปุ่มหรือลิงก์ที่พาไปทำต่อเป็น children ใส่ level={1} เมื่อเป็นเนื้อหาทั้งหน้า */
export function EmptyState({ level = 2, ...props }: StateProps & Level) {
  return <StateBox {...props} level={level} />;
}

/** ใช้ใน loading.tsx หรือ Suspense fallback ใส่ level={2} เมื่อวางในหน้าที่มี h1 แล้ว */
export function LoadingState({ title = "กำลังโหลด", level = 1 }: { title?: string } & Level) {
  return <StateBox title={title} role="status" level={level} />;
}

/** โหลดไม่สำเร็จ ปุ่มเริ่มต้นจะโหลดข้อมูลของหน้าเดิมใหม่โดยคงที่อยู่หน้าเว็บไว้ ใส่ level={2} เมื่อวางในหน้าที่มี h1 แล้ว */
export function ErrorState({
  title = "โหลดข้อมูลไม่สำเร็จ",
  message,
  action = <RetryButton />,
  level = 1,
}: {
  title?: string;
  message?: string;
  action?: ReactNode;
} & Level) {
  return (
    <StateBox title={title} message={message} role="alert" level={level}>
      {action}
    </StateBox>
  );
}

/** ข้อมูลไม่มีอยู่ หรือเป็นของคนอื่น ทั้งสองกรณีแสดงหน้าเดียวกัน ทางไปต่อเริ่มต้นคือหน้าแรก */
export function NotFoundState({
  title = "ไม่พบ",
  message,
  children = (
    <Link href="/" className="button">
      กลับหน้าแรก
    </Link>
  ),
}: Partial<StateProps>) {
  return (
    <StateBox title={title} message={message} level={1}>
      {children}
    </StateBox>
  );
}
