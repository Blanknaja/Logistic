import { createHash, randomBytes } from "node:crypto";
import { passwordError } from "@/features/account/server/accounts";
import type { EmailMessage } from "@/features/account/server/email";
import { hashPassword } from "@/features/account/server/password";
import { transaction, type Db } from "@/shared/db";
import { formatThaiDateTime } from "@/shared/format";

export const RESET_LINK_SENT = "ถ้าอีเมลนี้มีบัญชี เราส่งลิงก์ตั้งรหัสผ่านใหม่ให้แล้ว";

const RESET_LINK_LIFETIME_MS = 30 * 60 * 1000;

export type ResetPasswordResult =
  | { status: "done" }
  | { status: "link-unusable" }
  | { status: "invalid"; errors: { password: string } };

/** ฐานข้อมูลเก็บแค่ค่านี้ token จริงอยู่ในลิงก์ของอีเมลเท่านั้น */
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * ACC-009 สร้างลิงก์ใหม่ที่ใช้ได้ 30 นาที และทำให้ลิงก์เก่าของบัญชีนั้นใช้ไม่ได้
 * คืนอีเมลที่ต้องส่ง หรือ null ถ้าอีเมลนี้ไม่มีบัญชี หน้าเว็บต้องแสดง RESET_LINK_SENT ทั้งสองกรณี
 */
export function requestPasswordReset(db: Db, email: string, appUrl: string, now: Date = new Date()): EmailMessage | null {
  const account = db.prepare("SELECT id, email FROM accounts WHERE email = ?").get(email.trim()) as
    | { id: number; email: string }
    | undefined;
  if (!account) return null;

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + RESET_LINK_LIFETIME_MS);
  transaction(db, () => {
    db.prepare("UPDATE password_reset_tokens SET expires_at = ? WHERE account_id = ? AND expires_at > ?").run(
      now.toISOString(),
      account.id,
      now.toISOString(),
    );
    db.prepare(
      "INSERT INTO password_reset_tokens (account_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)",
    ).run(account.id, hashToken(token), now.toISOString(), expiresAt.toISOString());
  });

  const link = new URL(`/reset-password?token=${token}`, appUrl).href;
  return {
    to: account.email,
    subject: "ลิงก์ตั้งรหัสผ่านใหม่ของ Blanksong",
    text: [
      "มีคนขอตั้งรหัสผ่านใหม่ให้บัญชีของอีเมลนี้",
      `เปิดลิงก์นี้เพื่อตั้งรหัสผ่านใหม่ ใช้ได้ครั้งเดียว ถึง ${formatThaiDateTime(expiresAt, now)} น.`,
      link,
      "ถ้าคุณไม่ได้ขอ ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้",
    ].join("\n\n"),
  };
}

function usableLink(db: Db, token: string, now: Date) {
  return db
    .prepare("SELECT id, account_id FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?")
    .get(hashToken(token), now.toISOString()) as { id: number; account_id: number } | undefined;
}

/** ACC-010 ลิงก์ยังไม่หมดเวลา ยังไม่เคยใช้ และยังไม่มีลิงก์ใหม่มาแทน */
export function isResetLinkUsable(db: Db, token: string, now: Date = new Date()): boolean {
  return usableLink(db, token, now) !== undefined;
}

/** ACC-010 เปลี่ยนรหัสผ่าน ลิงก์ใช้ซ้ำไม่ได้ และทุกเครื่องของบัญชีนั้นออกจากระบบ */
export async function resetPassword(
  db: Db,
  input: { token: string; password: string },
  now: Date = new Date(),
): Promise<ResetPasswordResult> {
  const link = usableLink(db, input.token, now);
  if (!link) return { status: "link-unusable" };
  const error = passwordError(input.password);
  if (error) return { status: "invalid", errors: { password: error } };

  const passwordHash = await hashPassword(input.password);
  return transaction(db, () => {
    // ระหว่างรอ hash อีกคำขออาจใช้ลิงก์นี้ไปก่อน หรือมีลิงก์ใหม่มาแทนแล้ว
    const claimed = db
      .prepare("UPDATE password_reset_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL AND expires_at > ?")
      .run(now.toISOString(), link.id, now.toISOString());
    if (claimed.changes === 0) return { status: "link-unusable" };
    db.prepare("UPDATE accounts SET password_hash = ?, updated_at = ? WHERE id = ?").run(
      passwordHash,
      now.toISOString(),
      link.account_id,
    );
    db.prepare("DELETE FROM sessions WHERE account_id = ?").run(link.account_id);
    return { status: "done" };
  });
}
