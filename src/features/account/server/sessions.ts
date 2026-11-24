import { createHash, randomBytes } from "node:crypto";
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

/** เหตุที่เครื่องนี้ต้องเข้าสู่ระบบใหม่ ใช้เลือกข้อความในหน้าเข้าสู่ระบบ */
export type SessionProblem = "relogin" | "suspended";

/** อยู่ในระบบต่อได้อีกเท่านี้นับจากการใช้งานครั้งล่าสุด (ACC-006) */
export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

type AccountRow = { id: number; email: string; display_name: string; is_admin: number; shop_id: number | null };

const ACCOUNT_COLUMNS = "a.id, a.email, a.display_name, a.is_admin, s.id AS shop_id";

function toCurrentAccount(row: AccountRow): CurrentAccount {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    isAdmin: row.is_admin === 1,
    shopId: row.shop_id,
  };
}

/** ฐานข้อมูลเก็บแค่ค่านี้ token จริงอยู่ใน cookie ของเครื่องเท่านั้น */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** อ่านอย่างเดียว ไม่ต่ออายุ หน้าเว็บให้ใช้ getCurrentAccount() จาก @/shared/session แทน */
export function findAccountBySessionToken(db: Db, token: string, now: Date = new Date()): CurrentAccount | null {
  const row = db
    .prepare(
      `SELECT ${ACCOUNT_COLUMNS}
       FROM sessions se
       JOIN accounts a ON a.id = se.account_id
       LEFT JOIN shops s ON s.owner_account_id = a.id
       WHERE se.token_hash = ? AND se.expires_at > ? AND a.status = ?`,
    )
    .get(hashSessionToken(token), now.toISOString(), ACCOUNT_STATUS.active) as AccountRow | undefined;
  return row ? toCurrentAccount(row) : null;
}

/** เข้าสู่ระบบให้หนึ่งเครื่อง คืน token ที่ต้องเก็บใน cookie */
export function createSession(db: Db, accountId: number, now: Date = new Date()): string {
  const token = randomBytes(32).toString("base64url");
  db.prepare(
    "INSERT INTO sessions (account_id, token_hash, created_at, last_used_at, expires_at) VALUES (?, ?, ?, ?, ?)",
  ).run(
    accountId,
    hashSessionToken(token),
    now.toISOString(),
    now.toISOString(),
    new Date(now.getTime() + SESSION_LIFETIME_MS).toISOString(),
  );
  return token;
}

/**
 * ตรวจ token ของเครื่องนี้ ถ้ายังใช้ได้ ต่ออายุอีก 30 วันนับจากตอนนี้
 * ไม่ลบ session ของบัญชีที่ถูกระงับ หน้าเข้าสู่ระบบจะได้บอกเหตุได้ถูก
 */
export function resumeSession(
  db: Db,
  token: string,
  now: Date = new Date(),
): { account: CurrentAccount; problem: null } | { account: null; problem: SessionProblem } {
  const row = db
    .prepare(
      `SELECT se.id AS session_id, se.expires_at, a.status, ${ACCOUNT_COLUMNS}
       FROM sessions se
       JOIN accounts a ON a.id = se.account_id
       LEFT JOIN shops s ON s.owner_account_id = a.id
       WHERE se.token_hash = ?`,
    )
    .get(hashSessionToken(token)) as
    | (AccountRow & { session_id: number; expires_at: string; status: string })
    | undefined;
  if (!row || row.expires_at <= now.toISOString()) return { account: null, problem: "relogin" };
  if (row.status !== ACCOUNT_STATUS.active) return { account: null, problem: "suspended" };
  db.prepare("UPDATE sessions SET last_used_at = ?, expires_at = ? WHERE id = ?").run(
    now.toISOString(),
    new Date(now.getTime() + SESSION_LIFETIME_MS).toISOString(),
    row.session_id,
  );
  return { account: toCurrentAccount(row), problem: null };
}

/** ออกจากระบบเฉพาะเครื่องที่ถือ token นี้ เครื่องอื่นยังอยู่ในระบบ */
export function endSession(db: Db, token: string): void {
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashSessionToken(token));
}
