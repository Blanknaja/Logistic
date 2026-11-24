import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { transaction } from "./transaction";

export const MIGRATIONS_DIR = join(process.cwd(), "src/shared/db/migrations");

const FILE_NAME = /^\d{4}-[a-z0-9-]+\.sql$/;

/**
 * รันไฟล์ .sql ในโฟลเดอร์ที่ยังไม่เคยรัน เรียงตามชื่อไฟล์ ไฟล์ละหนึ่ง transaction
 * จำด้วยชื่อไฟล์เต็ม ไฟล์ที่ merge มาจาก branch อื่นทีหลังจึงยังถูกรัน
 * คืนรายชื่อไฟล์ที่รันรอบนี้
 */
export function migrate(db: DatabaseSync, dir: string = MIGRATIONS_DIR): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);

  const applied = new Map(
    db
      .prepare("SELECT name, checksum FROM schema_migrations")
      .all()
      .map((row) => [String(row.name), String(row.checksum)]),
  );

  const ran: string[] = [];
  for (const name of readdirSync(/* turbopackIgnore: true */ dir).sort()) {
    if (!FILE_NAME.test(name)) {
      throw new Error(`ชื่อ migration ผิดรูปแบบ: ${name} ต้องเป็น 0000-ชื่อภาษาอังกฤษ.sql`);
    }
    const sql = readFileSync(join(/* turbopackIgnore: true */ dir, name), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const previous = applied.get(name);
    if (previous !== undefined) {
      if (previous !== checksum) {
        throw new Error(
          `migration ${name} ถูกแก้หลังรันไปแล้ว ห้ามแก้ไฟล์เดิม ให้เพิ่มไฟล์ใหม่แทน (ถ้าเป็นฐานข้อมูลในเครื่องตัวเอง ล้างด้วย pnpm seed --reset)`,
        );
      }
      continue;
    }
    try {
      transaction(db, () => {
        db.exec(sql);
        db.prepare("INSERT INTO schema_migrations (name, checksum, applied_at) VALUES (?, ?, ?)").run(
          name,
          checksum,
          new Date().toISOString(),
        );
      });
    } catch (error) {
      throw new Error(`migration ${name} รันไม่ผ่าน: ${(error as Error).message}`, { cause: error });
    }
    ran.push(name);
  }
  return ran;
}
