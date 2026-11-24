import { hashPassword, verifyPassword } from "@/features/account/server/password";
import { createSession } from "@/features/account/server/sessions";
import { transaction, type Db } from "@/shared/db";
import { formatDateTime } from "@/shared/format";
import { ACCOUNT_STATUS } from "@/shared/statuses";

export const EMAIL_TAKEN = "อีเมลนี้มีบัญชีแล้ว เข้าสู่ระบบหรือกดลืมรหัสผ่าน";
export const WRONG_LOGIN = "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
export const SUSPENDED = "บัญชีนี้ถูกระงับ กรุณาติดต่อผู้ดูแลแพลตฟอร์ม";

const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
// รหัสยาวกว่านี้ตั้งไม่ได้อยู่แล้ว จึงไม่เสียเวลา hash ข้อความยาวที่ส่งมาถ่วงเซิร์ฟเวอร์
const MAX_PASSWORD_LENGTH = 64;

export type SignUpErrors = Partial<Record<"email" | "password" | "displayName", string>>;
export type ProfileErrors = Partial<Record<"displayName" | "phone", string>>;
export type Profile = { email: string; displayName: string; phone: string | null };

/** นับเป็นตัวอักษร ไม่ใช่หน่วยของ JavaScript */
const length = (text: string) => [...text].length;

function emailError(email: string): string | undefined {
  if (email === "") return "กรุณาใส่อีเมล";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "รูปแบบอีเมลไม่ถูกต้อง";
}

export function passwordError(password: string): string | undefined {
  if (length(password) < 8 || length(password) > MAX_PASSWORD_LENGTH) return "รหัสผ่านต้องยาว 8 ถึง 64 ตัวอักษร";
}

function displayNameError(displayName: string): string | undefined {
  if (displayName === "") return "กรุณาใส่ชื่อที่แสดง";
  if (length(displayName) > 50) return "ชื่อที่แสดงต้องยาว 1 ถึง 50 ตัวอักษร";
}

function phoneError(phone: string): string | undefined {
  if (phone !== "" && !/^0\d{9}$/.test(phone)) return "เบอร์โทรต้องเป็นตัวเลข 10 หลัก ขึ้นต้นด้วย 0";
}

/** ตัดช่องที่ไม่มีข้อผิดพลาดออก คืน null ถ้าไม่มีช่องไหนผิด */
function onlyErrors<T extends Record<string, string | undefined>>(errors: T): Partial<T> | null {
  const entries = Object.entries(errors).filter(([, message]) => message !== undefined);
  return entries.length === 0 ? null : (Object.fromEntries(entries) as Partial<T>);
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("UNIQUE constraint failed");
}

/** ACC-001 และ ACC-002 สร้างบัญชีทั่วไปแล้วเข้าสู่ระบบให้ทันที */
export async function signUp(
  db: Db,
  input: { email: string; password: string; displayName: string },
  now: Date = new Date(),
): Promise<{ ok: true; accountId: number; token: string } | { ok: false; errors: SignUpErrors }> {
  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName.trim();
  const errors = onlyErrors({
    email: emailError(email) ?? (db.prepare("SELECT 1 FROM accounts WHERE email = ?").get(email) ? EMAIL_TAKEN : undefined),
    password: passwordError(input.password),
    displayName: displayNameError(displayName),
  });
  if (errors) return { ok: false, errors };

  const passwordHash = await hashPassword(input.password);
  try {
    return transaction(db, () => {
      const accountId = Number(
        db
          .prepare(
            `INSERT INTO accounts (email, password_hash, display_name, is_admin, status, created_at, updated_at)
             VALUES (?, ?, ?, 0, ?, ?, ?)`,
          )
          .run(email, passwordHash, displayName, ACCOUNT_STATUS.active, now.toISOString(), now.toISOString()).lastInsertRowid,
      );
      return { ok: true as const, accountId, token: createSession(db, accountId, now) };
    });
  } catch (error) {
    // สองคนสมัครอีเมลเดียวกันพร้อมกัน ทั้งคู่ผ่านการตรวจข้างบน ฐานข้อมูลรับคนแรกคนเดียว
    if (isUniqueViolation(error)) return { ok: false, errors: { email: EMAIL_TAKEN } };
    throw error;
  }
}

/** เวลาที่อีเมลนี้จะเข้าสู่ระบบได้อีก หรือ null ถ้าไม่ได้ถูกพักอยู่ (ACC-004) */
function lockedUntil(db: Db, email: string, now: Date): Date | null {
  const failures = (
    db
      .prepare("SELECT failed_at FROM login_failures WHERE email = ? AND failed_at > ? ORDER BY failed_at")
      .all(email, new Date(now.getTime() - 2 * LOCK_MS).toISOString()) as { failed_at: string }[]
  ).map((row) => Date.parse(row.failed_at));

  let until = 0;
  for (let i = MAX_FAILURES - 1; i < failures.length; i++) {
    if (failures[i] - failures[i - MAX_FAILURES + 1] <= LOCK_MS) until = Math.max(until, failures[i] + LOCK_MS);
  }
  return until > now.getTime() ? new Date(until) : null;
}

let dummyHash: Promise<string> | undefined;

/** ACC-003 ถึง ACC-005 ข้อความตอนผิดไม่บอกว่าอีเมลนี้มีบัญชีหรือไม่ */
export async function logIn(
  db: Db,
  input: { email: string; password: string },
  now: Date = new Date(),
): Promise<{ ok: true; accountId: number; token: string } | { ok: false; error: string }> {
  const email = input.email.trim();
  const until = lockedUntil(db, email, now);
  if (until) return { ok: false, error: `ลองผิดหลายครั้งเกินไป ลองใหม่ได้หลัง ${formatDateTime(until).split(" ")[1]}` };

  const account = db.prepare("SELECT id, password_hash, status FROM accounts WHERE email = ?").get(email) as
    | { id: number; password_hash: string; status: string }
    | undefined;
  // อีเมลที่ไม่มีบัญชีก็ต้อง hash ให้ใช้เวลาเท่ากัน คนนอกจะเดาไม่ได้ว่าอีเมลไหนมีบัญชี
  const hash = account?.password_hash ?? (await (dummyHash ??= hashPassword("no-account-placeholder")));
  const matches = length(input.password) <= MAX_PASSWORD_LENGTH && (await verifyPassword(input.password, hash));

  if (!account || !matches) {
    db.prepare("INSERT INTO login_failures (email, failed_at) VALUES (?, ?)").run(email, now.toISOString());
    return { ok: false, error: WRONG_LOGIN };
  }
  if (account.status !== ACCOUNT_STATUS.active) return { ok: false, error: SUSPENDED };
  return { ok: true, accountId: account.id, token: createSession(db, account.id, now) };
}

/** ACC-011 โปรไฟล์ของบัญชีนี้เท่านั้น */
export function getProfile(db: Db, accountId: number): Profile | null {
  const row = db.prepare("SELECT email, display_name, phone FROM accounts WHERE id = ?").get(accountId) as
    | { email: string; display_name: string; phone: string | null }
    | undefined;
  return row ? { email: row.email, displayName: row.display_name, phone: row.phone } : null;
}

/** ACC-012 ค่าที่บันทึกทีหลังเป็นค่าที่ใช้ เบอร์โทรว่างคือลบเบอร์ */
export function updateProfile(
  db: Db,
  accountId: number,
  input: { displayName: string; phone: string },
  now: Date = new Date(),
): { ok: true } | { ok: false; errors: ProfileErrors } {
  const displayName = input.displayName.trim();
  const phone = input.phone.trim();
  const errors = onlyErrors({ displayName: displayNameError(displayName), phone: phoneError(phone) });
  if (errors) return { ok: false, errors };
  db.prepare("UPDATE accounts SET display_name = ?, phone = ?, updated_at = ? WHERE id = ?").run(
    displayName,
    phone === "" ? null : phone,
    now.toISOString(),
    accountId,
  );
  return { ok: true };
}
