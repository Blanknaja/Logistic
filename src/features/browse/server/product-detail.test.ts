import { beforeEach, describe, expect, test } from "vitest";
import { getProductDetail } from "@/features/browse/server/product-detail";
import type { Db } from "@/shared/db";
import { addProduct, addShop } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";

let db: Db;
let shopId: number;

beforeEach(() => {
  db = createTestDb();
  shopId = addShop(db, { name: "บ้านสวนผ้าไทย" }).id;
});

describe("BRW-008 หน้ารายละเอียดสินค้า", () => {
  test("ได้รูปทั้งหมดตามลำดับ ชื่อ ราคา รายละเอียด หมวดหมู่ ร้าน และสต็อก", () => {
    const images = [1, 2, 3, 4].map((n) => `/sample-images/bag-${n}.svg`);
    const { id, variantIds } = addProduct(db, {
      shopId,
      name: "กระเป๋าผ้าลายช้าง",
      description: "ผ้าฝ้ายทอมือ",
      categoryId: 2,
      price: 290,
      stock: 15,
      images,
    });

    expect(getProductDetail(db, id)).toEqual({
      id,
      name: "กระเป๋าผ้าลายช้าง",
      description: "ผ้าฝ้ายทอมือ",
      category: { id: 2, name: "กระเป๋าและรองเท้า" },
      shop: { id: shopId, name: "บ้านสวนผ้าไทย" },
      images,
      options: [],
      variants: [{ id: variantIds[0], valueIds: [], label: "", price: 290, stock: 15 }],
    });
  });

  test("สินค้าที่ไม่มีรูปยังเปิดได้ โดยรายการรูปว่าง", () => {
    const { id } = addProduct(db, { shopId, name: "พวงกุญแจไม้", price: 59, images: [] });
    expect(getProductDetail(db, id)).toMatchObject({ name: "พวงกุญแจไม้", images: [], variants: [{ price: 59 }] });
  });
});

describe("BRW-009 ตัวเลือกและสต็อกของแต่ละแบบย่อย", () => {
  test("ได้ตัวเลือก ค่าตัวเลือก และแบบย่อยที่ชี้ค่าตามลำดับตัวเลือก", () => {
    const { id, variantIds } = addProduct(db, {
      shopId,
      name: "เสื้อยืดคอกลม",
      options: [
        { name: "สี", values: ["แดง", "ดำ"] },
        { name: "ขนาด", values: ["M", "L"] },
      ],
      variants: [
        { price: 199, stock: 3 },
        { price: 209, stock: 1 },
        { price: 199, stock: 2 },
        { price: 219, stock: 0 },
      ],
    });

    const detail = getProductDetail(db, id)!;

    expect(detail.options.map((o) => [o.name, o.values.map((v) => v.value)])).toEqual([
      ["สี", ["แดง", "ดำ"]],
      ["ขนาด", ["M", "L"]],
    ]);
    const [red, black] = detail.options[0].values.map((v) => v.id);
    const [m, l] = detail.options[1].values.map((v) => v.id);
    expect(detail.variants).toEqual([
      { id: variantIds[0], valueIds: [red, m], label: "แดง M", price: 199, stock: 3 },
      { id: variantIds[1], valueIds: [red, l], label: "แดง L", price: 209, stock: 1 },
      { id: variantIds[2], valueIds: [black, m], label: "ดำ M", price: 199, stock: 2 },
      { id: variantIds[3], valueIds: [black, l], label: "ดำ L", price: 219, stock: 0 },
    ]);
  });

  test("ไม่แสดงแบบย่อยที่เลิกใช้ และค่าตัวเลือกที่ไม่มีแบบย่อยเหลือ", () => {
    const { id, variantIds } = addProduct(db, {
      shopId,
      options: [{ name: "สี", values: ["แดง", "ดำ"] }],
    });
    db.prepare("UPDATE variants SET removed_at = ? WHERE id = ?").run(new Date().toISOString(), variantIds[1]);

    const detail = getProductDetail(db, id)!;

    expect(detail.options[0].values.map((v) => v.value)).toEqual(["แดง"]);
    expect(detail.variants.map((v) => v.id)).toEqual([variantIds[0]]);
  });
});

describe("BRW-007 และ BRW-013 สินค้าที่เปิดไม่ได้", () => {
  test("สินค้าที่ไม่เป็นขายอยู่ หรือร้านถูกระงับ ได้ null", () => {
    for (const status of ["ซ่อน", "ร่าง", "ลบแล้ว"] as const) {
      expect(getProductDetail(db, addProduct(db, { shopId, status }).id)).toBeNull();
    }
    const { id } = addProduct(db, { shopId, name: "ผ้าพันคอไหม", price: 450 });
    expect(getProductDetail(db, id)).not.toBeNull();

    db.prepare("UPDATE shops SET status = 'ถูกระงับ' WHERE id = ?").run(shopId);

    expect(getProductDetail(db, id)).toBeNull();
  });

  test("สินค้าที่ไม่เคยมีอยู่ หรือเลขสินค้าใช้ไม่ได้ ได้ null", () => {
    expect(getProductDetail(db, 999_999)).toBeNull();
    expect(getProductDetail(db, Number("abc"))).toBeNull();
    expect(getProductDetail(db, 1.5)).toBeNull();
  });
});
