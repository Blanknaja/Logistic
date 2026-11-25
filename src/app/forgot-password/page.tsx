import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/features/account/components/account.module.css";
import { ForgotPasswordForm } from "@/features/account/components/forgot-password-form";

export const metadata: Metadata = { title: "ลืมรหัสผ่าน" };

export default function ForgotPasswordPage() {
  return (
    <div className={styles.page}>
      <h1>ลืมรหัสผ่าน</h1>
      <p className={styles.intro}>กรอกอีเมลของบัญชี เราจะส่งลิงก์ตั้งรหัสผ่านใหม่ที่ใช้ได้ 30 นาทีไปให้ ถ้าไม่ได้รับภายใน 1 นาที กดส่งลิงก์อีกครั้งได้</p>
      <ForgotPasswordForm />
      <p className={styles.more}>
        <Link href="/login">กลับไปหน้าเข้าสู่ระบบ</Link>
      </p>
    </div>
  );
}
