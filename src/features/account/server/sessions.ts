import { createHash } from "node:crypto";
import type { Db } from "@/shared/db";
import { ACCOUNT_STATUS } from "@/shared/statuses";

/** บัญชีที่เข้าสู่ระบบอยู่ ตามที่หน้าเว็บต้องรู้ */
export type CurrentAccount = {
  id: number;
  email: string;
  displayName: string;
  isAdmin: boolean;
  /** ร้านของบัญชีนี้ หรือ null ถ้ายังไม่เปิดร้าน */
  shopId: number | null;
};

/** ฐานข้อมูลเก็บแค่ค่านี้ token จริงอยู่ใน cookie ของเครื่องเท่านั้น */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function findAccountBySessionToken(db: Db, token: string, now: Date = new Date()): CurrentAccount | null {
  const row = db
    .prepare(
      `SELECT a.id, a.email, a.display_name, a.is_admin, s.id AS shop_id
       FROM sessions se
       JOIN accounts a ON a.id = se.account_id
       LEFT JOIN shops s ON s.owner_account_id = a.id
       WHERE se.token_hash = ? AND se.expires_at > ? AND a.status = ?`,
    )
    .get(hashSessionToken(token), now.toISOString(), ACCOUNT_STATUS.active) as
    | { id: number; email: string; display_name: string; is_admin: number; shop_id: number | null }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    isAdmin: row.is_admin === 1,
    shopId: row.shop_id,
  };
}
