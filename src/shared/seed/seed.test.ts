import { beforeAll, describe, expect, test } from "vitest";
import { verifyPassword } from "@/features/account/server/password";
import type { Db } from "@/shared/db";
import { addProduct } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";
import { ADMIN_PASSWORD, DEMO_PASSWORD, seed } from "@/shared/seed";

let db: Db;

const count = (sql: string, ...params: (string | number)[]) => Number(db.prepare(sql).get(...params)?.n);

// สร้างข้อมูลตัวอย่างครั้งเดียวแล้วใช้ร่วมกันทั้งไฟล์ เพราะ hash รหัสผ่านใช้เวลา
beforeAll(async () => {
  db = createTestDb();
  expect((await seed(db)).created).toBe(true);
});

describe("ข้อมูลตัวอย่าง", () => {
  test("มี 50 ร้าน 1,000 สินค้าที่ขายอยู่ และ 12 หมวดหมู่ ที่ทุกหมวดมีสินค้าอย่างน้อย 10 รายการ", () => {
    expect(count("SELECT count(*) AS n FROM shops WHERE status = 'เปิดอยู่'")).toBe(50);
    expect(count("SELECT count(*) AS n FROM products WHERE status = 'ขายอยู่'")).toBe(1000);
    expect(count("SELECT count(*) AS n FROM categories")).toBe(12);
    const smallest = db
      .prepare(
        `SELECT min(n) AS n FROM (
           SELECT c.id, count(p.id) AS n FROM categories c LEFT JOIN products p ON p.category_id = c.id GROUP BY c.id
         )`,
      )
      .get()?.n;
    expect(Number(smallest)).toBeGreaterThanOrEqual(10);
  });

  test("ทุกสินค้ามีแบบย่อย ราคา 1 ถึง 1,000,000 บาท และรูปอย่างน้อย 1 รูป", () => {
    expect(count("SELECT count(*) AS n FROM products p WHERE NOT EXISTS (SELECT 1 FROM variants v WHERE v.product_id = p.id)")).toBe(0);
    expect(count("SELECT count(*) AS n FROM variants WHERE price IS NULL OR price < 1 OR price > 1000000")).toBe(0);
    expect(count("SELECT count(*) AS n FROM products p WHERE NOT EXISTS (SELECT 1 FROM product_images i WHERE i.product_id = p.id)")).toBe(0);
  });

  test("มีสินค้าที่มีตัวเลือกอย่างน้อย 100 รายการ และสินค้าที่สต็อกเหลือ 0 อย่างน้อย 10 รายการ", () => {
    expect(count("SELECT count(DISTINCT product_id) AS n FROM product_options")).toBeGreaterThanOrEqual(100);
    expect(
      count("SELECT count(*) AS n FROM (SELECT product_id FROM variants GROUP BY product_id HAVING sum(stock) = 0)"),
    ).toBeGreaterThanOrEqual(10);
  });

  test("สต็อกตั้งต้นมีประวัติสต็อกที่ตรงกับตัวเลขสต็อก", () => {
    expect(
      count(
        `SELECT count(*) AS n FROM variants v
         WHERE v.stock <> coalesce((SELECT sum(change) FROM stock_history h WHERE h.variant_id = v.id), 0)`,
      ),
    ).toBe(0);
  });

  test("มีผู้ดูแลแพลตฟอร์ม 1 บัญชี และบัญชีผู้ซื้อกับผู้ขายตัวอย่างที่เข้าสู่ระบบด้วยรหัสผ่านใน README ได้", async () => {
    expect(count("SELECT count(*) AS n FROM accounts WHERE is_admin = 1")).toBe(1);
    const hashOf = (email: string) =>
      String(db.prepare("SELECT password_hash AS h FROM accounts WHERE email = ?").get(email)?.h);

    expect(await verifyPassword(ADMIN_PASSWORD, hashOf("admin@example.com"))).toBe(true);
    expect(await verifyPassword(DEMO_PASSWORD, hashOf("buyer1@example.com"))).toBe(true);
    expect(await verifyPassword(DEMO_PASSWORD, hashOf("seller01@example.com"))).toBe(true);
    expect(count("SELECT count(*) AS n FROM shops s JOIN accounts a ON a.id = s.owner_account_id WHERE a.email = ?", "seller01@example.com")).toBe(1);
    expect(count("SELECT count(*) AS n FROM shops s JOIN accounts a ON a.id = s.owner_account_id WHERE a.email LIKE 'buyer%'")).toBe(0);
  });

  test("รันซ้ำแล้วข้อมูลไม่ซ้ำ และของที่ผู้ใช้สร้างเองยังอยู่", async () => {
    const shopId = Number(db.prepare("SELECT id FROM shops LIMIT 1").get()?.id);
    addProduct(db, { shopId, name: "สินค้าใหม่ของผู้ขาย" });

    expect((await seed(db)).created).toBe(false);
    expect(count("SELECT count(*) AS n FROM products")).toBe(1001);
    expect(count("SELECT count(*) AS n FROM shops")).toBe(50);
    expect(count("SELECT count(*) AS n FROM accounts")).toBe(54);
  });
});
