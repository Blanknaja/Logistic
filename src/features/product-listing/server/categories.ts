import type { Db } from "@/shared/db";

export type Category = { id: number; name: string };

/** หมวดหมู่ทั้ง 12 หมวดของแพลตฟอร์ม เรียงตามลำดับใน requirement */
export function listCategories(db: Db): Category[] {
  return db.prepare("SELECT id, name FROM categories ORDER BY position").all() as Category[];
}
