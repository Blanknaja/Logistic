import { cookies } from "next/headers";
import { cache } from "react";
import { findAccountBySessionToken, type CurrentAccount } from "@/features/account/server/sessions";
import { getDb } from "@/shared/db";

export type { CurrentAccount };

/** ชื่อ cookie ที่เก็บ token การเข้าสู่ระบบของเครื่องนี้ */
export const SESSION_COOKIE = "bs_session";

/**
 * บัญชีที่เข้าสู่ระบบอยู่ในคำขอนี้ หรือ null ถ้ายังไม่เข้าสู่ระบบ
 * ใช้ได้ใน server component, server action และ route handler
 * เรียกกี่ครั้งในหนึ่งคำขอก็อ่านฐานข้อมูลครั้งเดียว
 */
export const getCurrentAccount = cache(async (): Promise<CurrentAccount | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return findAccountBySessionToken(getDb(), token);
});
