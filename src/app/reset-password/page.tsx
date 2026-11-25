import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/features/account/components/account.module.css";
import { ResetPasswordForm } from "@/features/account/components/reset-password-form";
import { isResetLinkUsable } from "@/features/account/server/password-reset";
import { getDb } from "@/shared/db";
import { EmptyState } from "@/shared/ui/states";

export const metadata: Metadata = { title: "ตั้งรหัสผ่านใหม่" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams;
  const usable = typeof token === "string" && isResetLinkUsable(getDb(), token);

  return (
    <div className={styles.page}>
      <h1>ตั้งรหัสผ่านใหม่</h1>
      {usable ? (
        <ResetPasswordForm token={token} />
      ) : (
        <EmptyState title="ลิงก์นี้ใช้ไม่ได้แล้ว" message="ลิงก์ใช้ได้ 30 นาที ใช้ได้ครั้งเดียว และใช้ได้เฉพาะลิงก์ล่าสุด">
          <Link href="/forgot-password" className="button">
            ขอลิงก์ใหม่
          </Link>
        </EmptyState>
      )}
    </div>
  );
}
