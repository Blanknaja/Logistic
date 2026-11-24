import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { migrate } from "@/shared/db/migrate";

let dir: string;
let db: DatabaseSync;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "blanksong-migrate-"));
  db = new DatabaseSync(":memory:");
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function addFile(name: string, sql: string) {
  writeFileSync(join(dir, name), sql);
}

function tables(): string[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'schema_%' ORDER BY name")
    .all()
    .map((row) => String(row.name));
}

describe("migrate", () => {
  test("รันทุกไฟล์ตามลำดับชื่อ และจำว่ารันไฟล์ไหนไปแล้ว", () => {
    addFile("0002-add-b.sql", "ALTER TABLE a ADD COLUMN b TEXT;");
    addFile("0001-create-a.sql", "CREATE TABLE a (id INTEGER PRIMARY KEY);");

    expect(migrate(db, dir)).toEqual(["0001-create-a.sql", "0002-add-b.sql"]);
    expect(tables()).toEqual(["a"]);
    expect(migrate(db, dir)).toEqual([]);
  });

  test("ไฟล์ที่ merge มาทีหลังยังถูกรัน แม้เลขน้อยกว่าไฟล์ที่รันไปแล้ว", () => {
    addFile("0001-create-a.sql", "CREATE TABLE a (id INTEGER PRIMARY KEY);");
    addFile("0003-create-c.sql", "CREATE TABLE c (id INTEGER PRIMARY KEY);");
    migrate(db, dir);

    addFile("0002-create-b.sql", "CREATE TABLE b (id INTEGER PRIMARY KEY);");
    expect(migrate(db, dir)).toEqual(["0002-create-b.sql"]);
    expect(tables()).toEqual(["a", "b", "c"]);
  });

  test("ไฟล์เลขเดียวกันจากสอง branch รันได้ทั้งคู่", () => {
    addFile("0002-cart-index.sql", "CREATE TABLE x (id INTEGER PRIMARY KEY);");
    addFile("0002-stock-index.sql", "CREATE TABLE y (id INTEGER PRIMARY KEY);");
    expect(migrate(db, dir)).toEqual(["0002-cart-index.sql", "0002-stock-index.sql"]);
  });

  test("ห้ามแก้ไฟล์ที่รันไปแล้ว", () => {
    addFile("0001-create-a.sql", "CREATE TABLE a (id INTEGER PRIMARY KEY);");
    migrate(db, dir);
    addFile("0001-create-a.sql", "CREATE TABLE a (id INTEGER PRIMARY KEY, extra TEXT);");

    expect(() => migrate(db, dir)).toThrow(/0001-create-a\.sql/);
  });

  test("ชื่อไฟล์ผิดรูปแบบ ไม่ถูกข้ามเงียบๆ", () => {
    addFile("add-thing.sql", "CREATE TABLE z (id INTEGER PRIMARY KEY);");
    expect(() => migrate(db, dir)).toThrow(/add-thing\.sql/);
  });

  test("ไฟล์ที่พังไม่ทิ้งของค้าง และไม่ถูกจดว่ารันแล้ว", () => {
    addFile("0001-broken.sql", "CREATE TABLE a (id INTEGER PRIMARY KEY); THIS IS NOT SQL;");

    expect(() => migrate(db, dir)).toThrow();
    expect(tables()).toEqual([]);
    expect(db.prepare("SELECT count(*) AS n FROM schema_migrations").get()?.n).toBe(0);
  });
});
