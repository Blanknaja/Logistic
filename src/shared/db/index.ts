import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "./migrate";

export { transaction } from "./transaction";

export type Db = DatabaseSync;

/** ที่เก็บไฟล์ฐานข้อมูล เปลี่ยนได้ด้วยค่า DATABASE_PATH */
export function databasePath(): string {
  return process.env.DATABASE_PATH ?? join(process.cwd(), "data", "blanksong.db");
}

/** เปิดฐานข้อมูลแล้วรัน migration ที่ยังไม่ได้รัน ใช้ ":memory:" สำหรับฐานข้อมูลชั่วคราว */
export function openDb(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path, { timeout: 5000 });
  db.exec("PRAGMA journal_mode = WAL");
  migrate(db);
  return db;
}

// next dev โหลดโมดูลใหม่บ่อย เก็บไว้บน globalThis เพื่อไม่เปิดไฟล์ซ้ำหลายครั้ง
const holder = globalThis as { blanksongDb?: Db };

/** ฐานข้อมูลของแอป ใช้ในหน้าเว็บและ server action เท่านั้น */
export function getDb(): Db {
  if (process.env.VITEST) {
    throw new Error("test ห้ามใช้ getDb() ให้ใช้ createTestDb() จาก @/shared/db/testing แล้วส่ง db เข้าฟังก์ชัน");
  }
  holder.blanksongDb ??= openDb(databasePath());
  return holder.blanksongDb;
}
