import type { Db } from "@/shared/db";

export type Category = { id: number; name: string };

/** หมวดหมู่ทั้ง 12 หมวดของแพลตฟอร์ม เรียงตามลำดับใน requirement */
export function listCategories(db: Db): Category[] {
  // แถวจาก node:sqlite ไม่มี prototype ซึ่ง React ส่งให้ client component ไม่ได้
  const rows = db.prepare("SELECT id, name FROM categories ORDER BY position").all() as Category[];
  return rows.map(({ id, name }) => ({ id, name }));
}
