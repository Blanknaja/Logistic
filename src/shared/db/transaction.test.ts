import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, test } from "vitest";
import { transaction } from "@/shared/db";

let db: DatabaseSync;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE t (x INTEGER NOT NULL)");
});

function values(): number[] {
  return db
    .prepare("SELECT x FROM t ORDER BY x")
    .all()
    .map((row) => Number(row.x));
}

describe("transaction", () => {
  test("บันทึกทั้งหมดเมื่อสำเร็จ และส่งค่าที่ฟังก์ชันคืนกลับมา", () => {
    const result = transaction(db, () => {
      db.prepare("INSERT INTO t VALUES (1), (2)").run();
      return "ok";
    });
    expect(result).toBe("ok");
    expect(values()).toEqual([1, 2]);
  });

  test("ย้อนทั้งหมดเมื่อมี error แล้วโยน error ต่อ", () => {
    expect(() =>
      transaction(db, () => {
        db.prepare("INSERT INTO t VALUES (1)").run();
        throw new Error("พัง");
      }),
    ).toThrow("พัง");
    expect(values()).toEqual([]);
    expect(db.isTransaction).toBe(false);
  });

  test("ซ้อนกันได้ ถ้าชั้นในพัง ย้อนเฉพาะชั้นใน", () => {
    transaction(db, () => {
      db.prepare("INSERT INTO t VALUES (1)").run();
      try {
        transaction(db, () => {
          db.prepare("INSERT INTO t VALUES (2)").run();
          throw new Error("ชั้นในพัง");
        });
      } catch {
        // ชั้นนอกเลือกทำต่อ
      }
      db.prepare("INSERT INTO t VALUES (3)").run();
    });
    expect(values()).toEqual([1, 3]);
  });

  test("ไม่รับฟังก์ชัน async เพราะ commit จะเกิดก่อนงานที่ await เสร็จ", () => {
    expect(() =>
      transaction(db, (async () => {
        db.prepare("INSERT INTO t VALUES (1)").run();
      }) as unknown as () => void),
    ).toThrow(/async/);
    expect(values()).toEqual([]);
  });
});
