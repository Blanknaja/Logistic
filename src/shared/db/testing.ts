import { openDb, type Db } from "@/shared/db";

/** ฐานข้อมูลใหม่ในหน่วยความจำ ที่รัน migration ครบแล้ว แต่ละ test ได้ของตัวเอง ไม่ชนกัน */
export function createTestDb(): Db {
  return openDb(":memory:");
}
