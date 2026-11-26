import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { loginPath } from "@/features/account/server/login-path";
import { findAccountBySessionToken, resumeSession, type CurrentAccount, type SessionProblem } from "@/features/account/server/sessions";
import { getDb } from "@/shared/db";

export type { CurrentAccount };

/** ชื่อ cookie ที่เก็บ token การเข้าสู่ระบบของเครื่องนี้ */
export const SESSION_COOKIE = "bs_session";

// อ่าน cookie และฐานข้อมูลครั้งเดียวต่อคำขอ ทุกฟังก์ชันข้างล่างใช้ผลเดียวกัน
const readSession = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? resumeSession(getDb(), token) : null;
});

/**
 * บัญชีที่เข้าสู่ระบบอยู่ในคำขอนี้ หรือ null ถ้ายังไม่เข้าสู่ระบบ
 * ใช้ได้ใน server component, server action และ route handler
 * เรียกกี่ครั้งในหนึ่งคำขอก็อ่านฐานข้อมูลครั้งเดียว
 */
export async function getCurrentAccount(): Promise<CurrentAccount | null> {
  return (await readSession())?.account ?? null;
}

/**
 * บัญชีของคำขอนี้โดยไม่ต่ออายุการเข้าสู่ระบบและไม่เขียนฐานข้อมูล
 * สำหรับคำขอที่หน้าเว็บส่งเองเป็นระยะ ซึ่งไม่ใช่การใช้งานของผู้ใช้ จึงไม่นับเป็น "ใช้ครั้งล่าสุด" ของ 30 วัน (ACC-006)
 */
export async function peekCurrentAccount(): Promise<CurrentAccount | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? findAccountBySessionToken(getDb(), token) : null;
}

/** หน้าที่ต้องเข้าสู่ระบบ: คืนบัญชี หรือพาไปหน้าเข้าสู่ระบบแล้วกลับมาที่ next */
export async function requireAccount(next: string): Promise<CurrentAccount> {
  const viewer = await getCurrentAccount();
  if (!viewer) redirect(loginPath(next));
  return viewer;
}

/** เครื่องนี้เคยเข้าสู่ระบบไว้แต่ใช้ไม่ได้แล้วเพราะอะไร null ถ้าไม่มีปัญหาหรือไม่เคยเข้าสู่ระบบ */
export async function getSessionProblem(): Promise<SessionProblem | null> {
  return (await readSession())?.problem ?? null;
}
