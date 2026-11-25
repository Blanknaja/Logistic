import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import styles from "@/features/account/components/account.module.css";
import { LoginForm } from "@/features/account/components/login-form";
import { isLoginNotice, LOGIN_NOTICE, safeNextPath } from "@/features/account/server/login-path";
import { getCurrentAccount, getSessionProblem } from "@/shared/session";

export const metadata: Metadata = { title: "เข้าสู่ระบบ" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, notice } = await searchParams;
  const nextPath = safeNextPath(next);
  if (await getCurrentAccount()) redirect(nextPath);

  const problem = await getSessionProblem();
  // บัญชีที่ถูกระงับต้องรู้เหตุนี้ก่อนข้อความอื่น
  const shown = problem === "suspended" ? problem : isLoginNotice(notice) ? notice : problem;

  return (
    <div className={styles.page}>
      <h1>เข้าสู่ระบบ</h1>
      {shown && (
        <p role="status" className={styles.notice}>
          {LOGIN_NOTICE[shown]}
        </p>
      )}
      <LoginForm next={nextPath} />
      <p>
        <Link href="/forgot-password">ลืมรหัสผ่าน</Link>
      </p>
      <p>
        ยังไม่มีบัญชี <Link href="/signup">สมัครบัญชี</Link>
      </p>
    </div>
  );
}
