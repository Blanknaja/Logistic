// pnpm tsx scripts/login-as.ts buyer1@example.com
// สร้างการเข้าสู่ระบบให้บัญชีในฐานข้อมูลของเครื่องนี้ แล้วพิมพ์ cookie ไว้ใช้ลองหน้าที่ต้องเข้าสู่ระบบ
// เช่น curl -b "$(pnpm -s tsx scripts/login-as.ts buyer1@example.com)" http://localhost:3200/profile

import { createSession } from "@/features/account/server/sessions";
import { databasePath, openDb } from "@/shared/db";
import { SESSION_COOKIE } from "@/shared/session";

const email = process.argv[2];
const db = openDb(databasePath());
const account = email ? (db.prepare("SELECT id FROM accounts WHERE email = ?").get(email) as { id: number } | undefined) : undefined;
if (!account) {
  console.error(`ไม่พบบัญชี ${email ?? ""} ใช้แบบนี้: pnpm tsx scripts/login-as.ts buyer1@example.com`);
  process.exit(1);
}
console.log(`${SESSION_COOKIE}=${createSession(db, account.id)}`);
db.close();
