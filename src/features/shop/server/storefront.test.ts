import { beforeEach, describe, expect, test } from "vitest";
import type { Db } from "@/shared/db";
import { addProduct, addShop } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";
import { PRODUCT_STATUS, SHOP_STATUS } from "@/shared/statuses";
import { getStorefront, listStorefrontProducts } from "./storefront";

let db: Db;
beforeEach(() => {
  db = createTestDb();
});

const minute = (n: number) => new Date(Date.UTC(2026, 10, 24, 1, n)).toISOString();

/** ร้านที่มีสินค้าที่ขายอยู่ count ชิ้น ชิ้นที่ n ลงขายนาทีที่ n */
function shopWithProducts(count: number, input: Parameters<typeof addShop>[1] = {}) {
  const shop = addShop(db, { name: "ร้านสมชายผ้าไทย", openedAt: "2026-11-24T02:00:00.000Z", ...input });
  const products = Array.from({ length: count }, (_, n) =>
    addProduct(db, { shopId: shop.id, name: `ผ้าไหม ${n + 1}`, price: 100 + n, stock: 5, createdAt: minute(n), publishedAt: minute(n) }),
  );
  return { shopId: shop.id, productIds: products.map((product) => product.id) };
}

describe("SHP-011 หน้าร้าน", () => {
  test("SHP-011 แสดงข้อมูลร้าน และสินค้าที่ขายอยู่ 23 ชิ้น ครั้งละ 20 ชิ้นเรียงจากที่ลงล่าสุด", () => {
    const { shopId, productIds } = shopWithProducts(23);
    db.prepare("UPDATE variants SET stock = 0 WHERE product_id = ?").run(productIds[22]);
    for (const status of [PRODUCT_STATUS.draft, PRODUCT_STATUS.hidden, PRODUCT_STATUS.deleted]) addProduct(db, { shopId, status, price: 99 });
    addProduct(db, { price: 99 });

    expect(getStorefront(db, shopId)).toEqual({
      id: shopId,
      name: "ร้านสมชายผ้าไทย",
      description: "",
      logoUrl: null,
      province: "กรุงเทพมหานคร",
      openedAt: "2026-11-24T02:00:00.000Z",
      status: SHOP_STATUS.open,
      productCount: 23,
    });

    const first = listStorefrontProducts(db, shopId);
    expect(first.items.map((item) => item.name)).toEqual(Array.from({ length: 20 }, (_, i) => `ผ้าไหม ${23 - i}`));
    expect(first.items[0]).toEqual({ id: productIds[22], name: "ผ้าไหม 23", price: 122, coverUrl: `/sample-images/p${productIds[22]}-1.svg`, soldOut: true });
    expect(first.items[1].soldOut).toBe(false);
    expect(first.next).not.toBeNull();

    const more = listStorefrontProducts(db, shopId, first.next);
    expect(more.items.map((item) => item.name)).toEqual(["ผ้าไหม 3", "ผ้าไหม 2", "ผ้าไหม 1"]);
    expect(more.next).toBeNull();
  });

  test("SHP-011 มีสินค้าลงใหม่ระหว่างกดดูเพิ่ม ชุดถัดไปไม่ซ้ำกับที่แสดงแล้ว", () => {
    const { shopId } = shopWithProducts(25);
    const first = listStorefrontProducts(db, shopId);
    addProduct(db, { shopId, name: "ผ้าไหมใหม่", price: 100, createdAt: minute(59), publishedAt: minute(59) });

    const more = listStorefrontProducts(db, shopId, first.next);

    expect(more.items.map((item) => item.name)).toEqual(["ผ้าไหม 5", "ผ้าไหม 4", "ผ้าไหม 3", "ผ้าไหม 2", "ผ้าไหม 1"]);
  });

  test("SHP-011 มีพอดี 20 ชิ้น ไม่มีชุดถัดไป", () => {
    const { shopId } = shopWithProducts(20);

    expect(listStorefrontProducts(db, shopId)).toMatchObject({ next: null });
  });
});

describe("SHP-012 หน้าร้านที่ไม่มีสินค้า และร้านที่ไม่มีอยู่", () => {
  test("SHP-012 ร้านที่ยังไม่มีสินค้าที่ขายอยู่ ได้ข้อมูลร้านและสินค้า 0 ชิ้น", () => {
    const { shopId } = shopWithProducts(0);
    addProduct(db, { shopId, status: PRODUCT_STATUS.draft, price: null });

    expect(getStorefront(db, shopId)).toMatchObject({ name: "ร้านสมชายผ้าไทย", productCount: 0 });
    expect(listStorefrontProducts(db, shopId)).toEqual({ items: [], next: null });
  });

  test("SHP-012 ลิงก์ที่ไม่ตรงกับร้านใดเลย ได้ null", () => {
    expect(getStorefront(db, 9999)).toBeNull();
    expect(listStorefrontProducts(db, 9999)).toEqual({ items: [], next: null });
  });
});

describe("SHP-014 หน้าร้านของร้านที่ถูกระงับ", () => {
  test("SHP-014 ร้านที่ถูกระงับยังมีชื่อและโลโก้ แต่สินค้า 0 ชิ้น", () => {
    const { shopId } = shopWithProducts(23, { status: SHOP_STATUS.suspended, logoUrl: "/sample-images/shop1.svg" });

    expect(getStorefront(db, shopId)).toMatchObject({
      name: "ร้านสมชายผ้าไทย",
      logoUrl: "/sample-images/shop1.svg",
      status: SHOP_STATUS.suspended,
      productCount: 0,
    });
    expect(listStorefrontProducts(db, shopId).items).toEqual([]);
  });

  test("SHP-014 เลิกระงับแล้ว หน้าร้านกลับมาเหมือนเดิม ข้อมูลไม่หาย", () => {
    const { shopId } = shopWithProducts(23, { status: SHOP_STATUS.suspended });
    db.prepare("UPDATE shops SET status = ? WHERE id = ?").run(SHOP_STATUS.open, shopId);

    expect(getStorefront(db, shopId)?.productCount).toBe(23);
    expect(listStorefrontProducts(db, shopId).items).toHaveLength(20);
  });
});

describe("SHP-Q01 ความเร็วแสดงผลหน้าร้าน", () => {
  const plan = (sql: string, ...args: (string | number)[]) =>
    (db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...args) as { detail: string }[]).map((row) => row.detail).join(" | ");

  test("SHP-Q01 ร้านที่มีสินค้าที่ขายอยู่ 200 ชิ้นในข้อมูล 1,000 สินค้า เปิด 100 ครั้ง 95 ครั้งเสร็จภายใน 2 วินาที", () => {
    const { shopId } = shopWithProducts(200);
    for (let s = 0; s < 4; s++) {
      const other = addShop(db);
      for (let p = 0; p < 200; p++) addProduct(db, { shopId: other.id, price: 100 });
    }

    const times = Array.from({ length: 100 }, () => {
      const start = performance.now();
      getStorefront(db, shopId);
      listStorefrontProducts(db, shopId);
      return performance.now() - start;
    }).sort((a, b) => a - b);

    expect(times[94]).toBeLessThan(2000);
  });

  test("SHP-Q01 สินค้าของร้านหาด้วย index ไม่ไล่ทั้งตาราง", () => {
    expect(plan("SELECT id FROM products WHERE shop_id = ? AND status = ?", 1, PRODUCT_STATUS.onSale)).toMatch(
      /SEARCH products USING .*INDEX products_shop/,
    );
  });
});
