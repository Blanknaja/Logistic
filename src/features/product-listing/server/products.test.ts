import { PAGE_SIZE } from "@/shared/paging";
import { beforeEach, describe, expect, test } from "vitest";
import type { Db } from "@/shared/db";
import { addProduct, addShop } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";
import { PRODUCT_STATUS } from "@/shared/statuses";
import { saveImageFile } from "./image-files";
import { EMPTY_PRODUCT, MESSAGES, variantCombos, type ProductValues } from "./product-rules";
import { countShopProducts, createProduct, listShopProducts } from "./products";

let db: Db;
let shopId: number;
beforeEach(() => {
  db = createTestDb();
  shopId = addShop(db).id;
});

const count = (table: string) => Number(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n);

function upload(forShop = shopId): string {
  const bytes = new Uint8Array(100);
  bytes.set([0xff, 0xd8, 0xff]);
  const saved = saveImageFile(db, forShop, bytes);
  if (!saved.ok) throw new Error(saved.error);
  return saved.url;
}

function tshirt(overrides: Partial<ProductValues> = {}): ProductValues {
  return {
    name: "เสื้อยืดคอกลม",
    description: "ผ้าฝ้าย 100%",
    categoryId: 1,
    images: [upload()],
    options: [],
    prices: { "[]": "250" },
    ...overrides,
  };
}

const colorSize = [
  { name: "สี", values: ["แดง", "ดำ"] },
  { name: "ขนาด", values: ["M", "L"] },
];

const pricesFor = (options: ProductValues["options"], prices: string[]) =>
  Object.fromEntries(variantCombos(options).map((combo, i) => [combo.key, prices[i]]));

const at = (time: string) => new Date(`2026-11-25T${time}:00+07:00`);

describe("PRD-002 สร้างสินค้าและเปิดขาย", () => {
  test("PRD-002 ข้อมูลครบ สินค้าเป็น ขายอยู่ ในร้านของผู้ขาย และเป็นชิ้นบนสุดของรายการ", () => {
    addProduct(db, { shopId, createdAt: at("09:00").toISOString() });
    const result = createProduct(db, shopId, tshirt(), "publish", at("10:02"));

    expect(result.ok).toBe(true);
    const [top] = listShopProducts(db, shopId, {}).items;
    expect(top).toMatchObject({
      name: "เสื้อยืดคอกลม",
      status: PRODUCT_STATUS.onSale,
      minPrice: 250,
      maxPrice: 250,
      totalStock: 0,
      updatedAt: at("10:02").toISOString(),
    });
    const row = db.prepare("SELECT shop_id, category_id, published_at FROM products WHERE id = ?").get(top.id);
    expect(row).toEqual({ shop_id: shopId, category_id: 1, published_at: at("10:02").toISOString() });
  });

  test("PRD-002 ข้อมูลไม่ครบ ได้ข้อความทุกช่องที่ผิด และยังไม่มีสินค้าใหม่ในร้าน", () => {
    const result = createProduct(
      db,
      shopId,
      tshirt({ name: "กางเกงขาสั้น", description: "", categoryId: null, prices: { "[]": "0" } }),
      "publish",
    );

    expect(result).toEqual({
      ok: false,
      errors: { description: MESSAGES.descriptionRequired, categoryId: MESSAGES.categoryRequired, "price.[]": MESSAGES.priceRule },
    });
    expect(count("products")).toBe(0);
  });

  test("PRD-002 หมวดหมู่ที่ไม่มีในรายการของแพลตฟอร์ม ไม่รับ", () => {
    expect(createProduct(db, shopId, tshirt({ categoryId: 99 }), "publish")).toEqual({
      ok: false,
      errors: { categoryId: MESSAGES.categoryRequired },
    });
    expect(count("products")).toBe(0);
  });
});

describe("PRD-003 รูปสินค้า", () => {
  test("PRD-003 รูปเก็บตามลำดับที่ผู้ขายเรียง รูปแรกเป็นรูปปก", () => {
    const [first, second, third] = [upload(), upload(), upload()];
    const result = createProduct(db, shopId, tshirt({ images: [third, first, second] }), "publish");

    expect(result.ok).toBe(true);
    const urls = db.prepare("SELECT url FROM product_images ORDER BY position").all().map((row) => row.url);
    expect(urls).toEqual([third, first, second]);
    expect(listShopProducts(db, shopId, {}).items[0].coverUrl).toBe(third);
  });

  test("PRD-003 รูปที่ไม่ได้ส่งผ่านร้านนี้ ไม่รับ และไม่สร้างสินค้า", () => {
    const otherShop = addShop(db).id;
    const result = createProduct(db, shopId, tshirt({ images: [upload(otherShop)] }), "publish");

    expect(result).toEqual({ ok: false, errors: { images: MESSAGES.imageNotFound } });
    expect(count("products")).toBe(0);
  });
});

describe("PRD-004 ตัวเลือกและแบบย่อย", () => {
  test("PRD-004 สีกับขนาดอย่างละ 2 ค่า ได้แบบย่อย 4 แบบพร้อมราคาของตัวเอง และรายการแสดงช่วงราคา 250 ถึง 290", () => {
    const result = createProduct(
      db,
      shopId,
      tshirt({ options: colorSize, prices: pricesFor(colorSize, ["250", "250", "270", "290"]) }),
      "publish",
    );
    if (!result.ok) throw new Error(JSON.stringify(result.errors));

    const variants = db
      .prepare(
        `SELECT v1.value || ' ' || v2.value AS label, v.price, v.stock FROM variants v
         JOIN product_option_values v1 ON v1.id = v.option_value1_id
         JOIN product_option_values v2 ON v2.id = v.option_value2_id
         WHERE v.product_id = ? ORDER BY v.position`,
      )
      .all(result.productId);
    expect(variants).toEqual([
      { label: "แดง M", price: 250, stock: 0 },
      { label: "แดง L", price: 250, stock: 0 },
      { label: "ดำ M", price: 270, stock: 0 },
      { label: "ดำ L", price: 290, stock: 0 },
    ]);
    const options = db.prepare("SELECT name FROM product_options ORDER BY position").all().map((row) => row.name);
    expect(options).toEqual(["สี", "ขนาด"]);
    expect(listShopProducts(db, shopId, {}).items[0]).toMatchObject({ minPrice: 250, maxPrice: 290 });
  });

  test("PRD-004 แบบย่อย ดำ L ยังไม่มีราคา สินค้ายังไม่ถูกเปิดขาย", () => {
    const result = createProduct(
      db,
      shopId,
      tshirt({ options: colorSize, prices: pricesFor(colorSize, ["250", "250", "270", ""]) }),
      "publish",
    );

    expect(result).toEqual({ ok: false, errors: { 'price.["ดำ","L"]': MESSAGES.pricesIncomplete } });
    expect(count("products")).toBe(0);
    expect(count("variants")).toBe(0);
  });
});

describe("PRD-005 บันทึกเป็นร่าง", () => {
  test("PRD-005 มีชื่อกับราคา ไม่มีรูปและหมวดหมู่ บันทึกเป็น ร่าง พร้อมข้อมูลที่กรอก", () => {
    const result = createProduct(db, shopId, { ...EMPTY_PRODUCT, name: "หมวกแก๊ป", prices: { "[]": "120" } }, "draft");

    expect(result.ok).toBe(true);
    expect(listShopProducts(db, shopId, {}).items[0]).toMatchObject({
      name: "หมวกแก๊ป",
      status: PRODUCT_STATUS.draft,
      coverUrl: null,
      minPrice: 120,
      maxPrice: 120,
    });
    const row = db.prepare("SELECT category_id, published_at FROM products").get();
    expect(row).toEqual({ category_id: null, published_at: null });
  });

  test("PRD-005 ร่างที่ยังไม่กรอกราคา เก็บราคาว่างไว้", () => {
    createProduct(db, shopId, { ...EMPTY_PRODUCT, name: "หมวกแก๊ป", options: [{ name: "สี", values: ["แดง"] }] }, "draft");
    expect(db.prepare("SELECT price FROM variants").all()).toEqual([{ price: null }]);
    expect(listShopProducts(db, shopId, {}).items[0]).toMatchObject({ minPrice: null, maxPrice: null });
  });

  test("PRD-005 ไม่มีชื่อ บันทึกร่างไม่ได้ และยังไม่มีสินค้าใหม่ในร้าน", () => {
    expect(createProduct(db, shopId, { ...EMPTY_PRODUCT, prices: { "[]": "120" } }, "draft")).toEqual({
      ok: false,
      errors: { name: MESSAGES.nameRequiredForDraft },
    });
    expect(count("products")).toBe(0);
  });
});

describe("PRD-001 รายการสินค้าของร้าน", () => {
  /** ร้านของสมชาย: ขายอยู่ 18 ซ่อน 3 ร่าง 2 ลบแล้ว 1 ชิ้นที่ i มากแก้ล่าสุด */
  function somchaiShop() {
    const statuses = [
      ...Array(18).fill(PRODUCT_STATUS.onSale),
      ...Array(3).fill(PRODUCT_STATUS.hidden),
      ...Array(2).fill(PRODUCT_STATUS.draft),
      PRODUCT_STATUS.deleted,
    ];
    return statuses.map((status, i) =>
      addProduct(db, {
        shopId,
        status,
        name: `สินค้า ${i + 1}`,
        createdAt: new Date(Date.UTC(2026, 10, 25, 0, i)).toISOString(),
      }),
    );
  }

  test("PRD-001 หน้าแรกมี 20 ชิ้น ชิ้นบนสุดแก้ล่าสุด ไม่มีสินค้าที่ลบแล้ว และมีหน้าถัดไปอีก 3 ชิ้น", () => {
    somchaiShop();
    const first = listShopProducts(db, shopId, {});

    expect(first.items).toHaveLength(PAGE_SIZE);
    expect(first.items[0].name).toBe("สินค้า 23");
    expect(first.total).toBe(23);
    expect(first.pageCount).toBe(2);
    const second = listShopProducts(db, shopId, { page: 2 });
    expect(second.items.map((item) => item.name)).toEqual(["สินค้า 3", "สินค้า 2", "สินค้า 1"]);
  });

  test("PRD-001 ตัวกรองบอกจำนวนสินค้าในแต่ละสถานะ ไม่นับที่ลบแล้ว", () => {
    somchaiShop();
    expect(countShopProducts(db, shopId)).toEqual({
      all: 23,
      [PRODUCT_STATUS.onSale]: 18,
      [PRODUCT_STATUS.hidden]: 3,
      [PRODUCT_STATUS.draft]: 2,
    });
    expect(listShopProducts(db, shopId, { status: PRODUCT_STATUS.hidden }).items.map((item) => item.status)).toEqual(
      Array(3).fill(PRODUCT_STATUS.hidden),
    );
  });

  test("PRD-001 แบบย่อยราคา 250 ถึง 290 ได้ราคาต่ำสุดและสูงสุด สต็อกรวมทุกแบบย่อยที่ยังใช้อยู่", () => {
    const product = addProduct(db, {
      shopId,
      options: [{ name: "ขนาด", values: ["M", "L", "XL"] }],
      variants: [
        { price: 250, stock: 2 },
        { price: 290, stock: 3 },
        { price: 999, stock: 50 },
      ],
    });
    db.prepare("UPDATE variants SET removed_at = ? WHERE id = ?").run(new Date().toISOString(), product.variantIds[2]);

    expect(listShopProducts(db, shopId, {}).items[0]).toMatchObject({ minPrice: 250, maxPrice: 290, totalStock: 5 });
  });

  test("PRD-001 ค้นหาจากชื่อ เจอเฉพาะชิ้นที่ชื่อมีคำนั้น", () => {
    somchaiShop();
    addProduct(db, { shopId, name: "ร่มพับ" });
    expect(listShopProducts(db, shopId, { q: "ร่ม" }).items.map((item) => item.name)).toEqual(["ร่มพับ"]);
  });

  test("PRD-001 ค้นหาไม่เจอ ได้รายการว่าง แต่จำนวนในตัวกรองยังเท่าเดิม", () => {
    somchaiShop();
    const result = listShopProducts(db, shopId, { q: "ร่ม" });
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(countShopProducts(db, shopId).all).toBe(23);
  });

  test("PRD-001 ร้านที่ยังไม่มีสินค้า ได้รายการว่างและจำนวนเป็น 0", () => {
    expect(listShopProducts(db, shopId, {})).toMatchObject({ items: [], total: 0, pageCount: 1 });
    expect(countShopProducts(db, shopId).all).toBe(0);
  });
});

describe("PRD-012 เห็นและสร้างได้เฉพาะในร้านตัวเอง", () => {
  test("PRD-012 รายการของร้านหนึ่งไม่มีสินค้าของร้านอื่น ทุกสถานะ", () => {
    const otherShop = addShop(db).id;
    addProduct(db, { shopId: otherShop, status: PRODUCT_STATUS.draft, name: "ร่างของร้านอื่น" });
    addProduct(db, { shopId, name: "ของเรา" });

    expect(listShopProducts(db, shopId, {}).items.map((item) => item.name)).toEqual(["ของเรา"]);
    expect(countShopProducts(db, shopId).all).toBe(1);
  });

  test("PRD-012 สินค้าที่สร้างอยู่ในร้านที่ส่งมาเท่านั้น", () => {
    const otherShop = addShop(db).id;
    createProduct(db, shopId, tshirt(), "publish");
    expect(countShopProducts(db, otherShop).all).toBe(0);
  });
});

describe("PRD-Q01 ความเร็วของรายการสินค้าของร้าน", () => {
  test("PRD-Q01 ร้านที่มี 200 ชิ้น โหลดรายการและจำนวนได้เร็วกว่า 2 วินาทีมาก", () => {
    for (let i = 0; i < 200; i++) {
      addProduct(db, { shopId, options: [{ name: "ขนาด", values: ["S", "M", "L"] }], images: ["/a.svg", "/b.svg"] });
    }
    const started = performance.now();
    const result = listShopProducts(db, shopId, { page: 5 });
    countShopProducts(db, shopId);
    expect(result.items).toHaveLength(PAGE_SIZE);
    expect(performance.now() - started).toBeLessThan(200);
  });

  test("PRD-Q01 เลขหน้าเกินจำนวนหน้าหรือผิดรูปแบบ ได้หน้าที่มีอยู่จริงแทนรายการที่ขาดหาย", () => {
    for (let i = 0; i < 3; i++) addProduct(db, { shopId });
    expect(listShopProducts(db, shopId, { page: 99 })).toMatchObject({ page: 1, pageCount: 1 });
    expect(listShopProducts(db, shopId, { page: 99 }).items).toHaveLength(3);
    expect(listShopProducts(db, shopId, { page: -1 }).page).toBe(1);
  });
});

describe("PRD-Q02 ความเร็วในการบันทึกสินค้า", () => {
  const big = () => {
    const options = [
      { name: "สี", values: Array.from({ length: 10 }, (_, i) => `สี${i}`) },
      { name: "ขนาด", values: Array.from({ length: 10 }, (_, i) => `ขนาด${i}`) },
    ];
    return tshirt({
      images: Array.from({ length: 9 }, () => upload()),
      options,
      prices: pricesFor(options, Array.from({ length: 100 }, (_, i) => String(100 + i))),
    });
  };

  test("PRD-Q02 สินค้า 9 รูป 100 แบบย่อย บันทึกเสร็จเร็วกว่า 2 วินาทีมาก", () => {
    const started = performance.now();
    expect(createProduct(db, shopId, big(), "publish").ok).toBe(true);
    expect(performance.now() - started).toBeLessThan(500);
    expect(count("variants")).toBe(100);
  });

  test("PRD-Q02 บันทึกล้มกลางทาง ไม่มีสินค้าที่บันทึกไปครึ่งเดียว", () => {
    db.exec(`CREATE TRIGGER fail_mid_save BEFORE INSERT ON variants WHEN NEW.position = 50
             BEGIN SELECT RAISE(ABORT, 'ดิสก์เต็ม'); END`);

    expect(() => createProduct(db, shopId, big(), "publish")).toThrow("ดิสก์เต็ม");
    for (const table of ["products", "product_images", "product_options", "product_option_values", "variants"]) {
      expect(count(table)).toBe(0);
    }
  });
});
