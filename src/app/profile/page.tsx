import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { logOutAction } from "@/features/account/actions";
import styles from "@/features/account/components/account.module.css";
import { LogoutButton } from "@/features/account/components/logout-button";
import { ProfileForm } from "@/features/account/components/profile-form";
import { getProfile } from "@/features/account/server/accounts";
import { getDb } from "@/shared/db";
import { requireAccount } from "@/shared/session";

export const metadata: Metadata = { title: "โปรไฟล์" };

export default async function ProfilePage({ searchParams }: PageProps<"/profile">) {
  const viewer = await requireAccount("/profile");
  const profile = getProfile(getDb(), viewer.id);
  if (!profile) notFound();
  const { edit, saved } = await searchParams;

  return (
    <div className={styles.page}>
      <h1>โปรไฟล์</h1>
      {edit ? (
        <ProfileForm displayName={profile.displayName} phone={profile.phone ?? ""} />
      ) : (
        <>
          {saved && (
            <p role="status" className={styles.notice}>
              บันทึกแล้ว
            </p>
          )}
          <dl className={styles.profile}>
            <dt>อีเมล</dt>
            <dd>{profile.email}</dd>
            <dt>ชื่อที่แสดง</dt>
            <dd>{profile.displayName}</dd>
            <dt>เบอร์โทร</dt>
            <dd>
              {profile.phone ?? (
                <>
                  ยังไม่ได้ใส่เบอร์โทร
                  <Link href="/profile?edit=1" className="button button-secondary">
                    เพิ่มเบอร์โทร
                  </Link>
                </>
              )}
            </dd>
          </dl>
          <div className={styles.actions}>
            <Link href="/profile?edit=1" className="button">
              แก้ไข
            </Link>
            <form action={logOutAction}>
              <LogoutButton />
            </form>
          </div>
        </>
      )}
    </div>
  );
}
