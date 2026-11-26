import Link from "next/link";
import type { ReactNode } from "react";
import { RetryButton } from "./retry-button";

// รูปแบบกลางของหน้าว่าง หน้ากำลังโหลด หน้าผิดพลาด และหน้า "ไม่พบ" ทุก feature ใช้ชุดนี้
// หัวข้อเป็น h1 เมื่อกล่องนี้คือเนื้อหาทั้งหน้า และ h2 เมื่อวางในหน้าที่มี h1 อยู่แล้ว ตาดูเหมือนกันทั้งสองแบบ

type Level = { level?: 1 | 2 };

// ภาพเส้นบนตาราง 24 จุด แบบเดียวกับไอคอนหมวดใน src/shared/category-icons.ts
const ART = {
  box: "M3 8l9-5 9 5v8l-9 5-9-5V8Zm0 0 9 5 9-5M12 13v8M7.5 5.5l9 5",
  cart: "M3 4h2.5l2.2 11h9.8L20 7.5H6.4M9.5 19.5h.01M16.5 19.5h.01",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 4.5 4.5M8.5 11h5",
  alert: "M12 4 2.5 20h19L12 4Zm0 6.5v4.5m0 2.5v.01",
  pin: "M12 21s7-6.2 7-11.5a7 7 0 1 0-14 0C5 14.8 12 21 12 21Zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  shop: "M4 10v10h16V10M3 10l2-6h14l2 6a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0Zm7 10v-5h4v5",
  key: "M14.5 9.5a4 4 0 1 0-3.9 5H12l1.5 1.5H15V17.5h1.5V19H19v-2.5l-4.7-4.7c.1-.4.2-.8.2-1.3Zm-5-1h.01",
};

export type StateArt = keyof typeof ART;

const ART_TONE: Partial<Record<StateArt, string>> = { alert: "state-art-alert", search: "state-art-calm", pin: "state-art-calm" };

/** ภาพเล็กในวงกลมสีอ่อน ใช้เหนือหัวเรื่องของหน้าว่าง หน้าผลลัพธ์ และฟอร์มที่เป็นทั้งหน้า */
export function StateArtIcon({ art }: { art: StateArt }) {
  return (
    <span className={["state-art", ART_TONE[art]].filter(Boolean).join(" ")} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="36" height="36" focusable="false">
        <path d={ART[art]} />
      </svg>
    </span>
  );
}

type StateProps = {
  title: string;
  message?: string;
  children?: ReactNode;
  art?: StateArt;
};

function StateBox({ title, message, children, role, level, art }: StateProps & Required<Level> & { role?: "status" | "alert" }) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <section className="state" role={role}>
      {art && <StateArtIcon art={art} />}
      <Heading className="state-title">{title}</Heading>
      {message && <p className="state-message">{message}</p>}
      {children && <div className="state-actions">{children}</div>}
    </section>
  );
}

/** ไม่มีข้อมูลให้แสดง ส่งปุ่มหรือลิงก์ที่พาไปทำต่อเป็น children ใส่ level={1} เมื่อเป็นเนื้อหาทั้งหน้า */
export function EmptyState({ level = 2, art = "box", ...props }: StateProps & Level) {
  return <StateBox {...props} art={art} level={level} />;
}

/** ใช้ใน loading.tsx หรือ Suspense fallback ใส่ level={2} เมื่อวางในหน้าที่มี h1 แล้ว */
export function LoadingState({ title = "กำลังโหลด", level = 1 }: { title?: string } & Level) {
  return (
    <StateBox title={title} role="status" level={level}>
      <span className="skeleton state-loading" />
    </StateBox>
  );
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
    <StateBox title={title} message={message} role="alert" level={level} art="alert">
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
  art = "search",
}: Partial<StateProps>) {
  return (
    <StateBox title={title} message={message} level={1} art={art}>
      {children}
    </StateBox>
  );
}
