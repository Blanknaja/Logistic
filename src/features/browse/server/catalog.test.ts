import { describe, expect, test } from "vitest";
import { countVisibleProducts } from "@/features/browse/server/catalog";
import { addProduct, addShop } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";

describe("countVisibleProducts", () => {
  test("นับเฉพาะสินค้าที่ขายอยู่ของร้านที่เปิดอยู่", () => {
    const db = createTestDb();
    const open = addShop(db);
    const suspended = addShop(db, { status: "ถูกระงับ" });
    addProduct(db, { shopId: open.id });
    addProduct(db, { shopId: open.id, stock: 0 });
    addProduct(db, { shopId: open.id, status: "ร่าง" });
    addProduct(db, { shopId: open.id, status: "ซ่อน" });
    addProduct(db, { shopId: open.id, status: "ลบแล้ว" });
    addProduct(db, { shopId: suspended.id });

    expect(countVisibleProducts(db)).toBe(2);
  });
});
