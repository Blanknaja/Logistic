import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import styles from "@/features/account/components/account.module.css";
import { SignupForm } from "@/features/account/components/signup-form";
import { getCurrentAccount } from "@/shared/session";

export const metadata: Metadata = { title: "สมัครบัญชี" };

export default async function SignupPage() {
  if (await getCurrentAccount()) redirect("/");
  return (
    <div className={styles.page}>
      <h1>สมัครบัญชี</h1>
      <SignupForm />
      <p>
        มีบัญชีแล้ว <Link href="/login">เข้าสู่ระบบ</Link>
      </p>
    </div>
  );
}
