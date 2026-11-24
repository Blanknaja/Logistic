// pnpm seed          รัน migration แล้วสร้างข้อมูลตัวอย่างถ้ายังไม่มี
// pnpm seed --reset  ลบฐานข้อมูลในเครื่องทิ้งแล้วสร้างใหม่ทั้งหมด

import { rmSync } from "node:fs";
import { databasePath, openDb } from "@/shared/db";
import { seed } from "@/shared/seed";

const path = databasePath();

if (process.argv.includes("--reset")) {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(path + suffix, { force: true });
  console.log("ลบฐานข้อมูลเดิมแล้ว");
}

const db = openDb(path);
const { created } = await seed(db);
db.close();
console.log(created ? "สร้างข้อมูลตัวอย่างแล้ว" : "มีข้อมูลตัวอย่างอยู่แล้ว ไม่สร้างซ้ำ");
