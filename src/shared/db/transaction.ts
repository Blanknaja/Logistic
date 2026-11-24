import type { DatabaseSync } from "node:sqlite";

const savepointDepth = new WeakMap<DatabaseSync, number>();

/**
 * รัน fn ใน transaction เดียว ถ้า fn โยน error จะย้อนทุกอย่างที่ fn เขียน
 * เรียกซ้อนกันได้ ชั้นในใช้ SAVEPOINT จึงย้อนเฉพาะชั้นใน
 * fn ต้องเป็นฟังก์ชันธรรมดา ห้าม async
 */
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  const outer = !db.isTransaction;
  const depth = savepointDepth.get(db) ?? 0;
  const savepoint = `sp_${depth}`;

  // IMMEDIATE จองสิทธิ์เขียนตั้งแต่ต้น สองโปรเซสจึงไม่ชนกันกลางทาง
  db.exec(outer ? "BEGIN IMMEDIATE" : `SAVEPOINT ${savepoint}`);
  savepointDepth.set(db, depth + 1);
  try {
    const result = fn();
    if (result instanceof Promise) {
      throw new Error("transaction() ไม่รับฟังก์ชัน async ให้ await ให้เสร็จก่อนแล้วค่อยเขียนในฟังก์ชันธรรมดา");
    }
    db.exec(outer ? "COMMIT" : `RELEASE ${savepoint}`);
    return result;
  } catch (error) {
    db.exec(outer ? "ROLLBACK" : `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`);
    throw error;
  } finally {
    savepointDepth.set(db, depth);
  }
}
