import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { dynamic } from "@/app/layout";

// ฟอนต์ของ next/font ถูกแทนที่ตอน build ของ Next.js นอกนั้นไม่มีค่า
vi.mock("next/font/google", () => ({ Noto_Sans_Thai_Looped: () => ({ variable: "" }), Noto_Serif_Thai: () => ({ variable: "" }) }));
import { getProductDetail } from "@/features/browse/server/product-detail";
import { parseBrowseParams, type RawSearchParams } from "@/features/browse/search-params";
import { readSentence } from "@/features/browse/sentence";
import { searchProducts } from "@/features/browse/server/search";
import type { Db } from "@/shared/db";
import { addProduct, addShop, type ProductInput } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";

let db: Db;
let shopId: number;
let minute = 0;

beforeEach(() => {
  db = createTestDb();
  shopId = addShop(db, { name: "บ้านสวนผ้าไทย" }).id;
  minute = 0;
});

/** ลงขายทีละรายการ รายการที่เพิ่มทีหลังใหม่กว่า */
function product(input: ProductInput = {}) {
  minute += 1;
  const createdAt = new Date(Date.UTC(2026, 10, 24, 0, minute)).toISOString();
  return addProduct(db, { shopId, createdAt, ...input });
}

const search = (raw: RawSearchParams = {}) => searchProducts(db, parseBrowseParams(raw));

describe("BRW-001 หน้าแรก", () => {
  test("แสดงสินค้า 20 รายการแรกที่ลงขายล่าสุด พร้อมจำนวนทั้งหมด", () => {
    const ids = Array.from({ length: 25 }, (_, i) => product({ name: `สินค้า ${i + 1}`, price: 100 + i }).id);

    const result = search();

    expect(result.total).toBe(25);
    expect(result.items).toHaveLength(20);
    expect(result.items.map((item) => item.id)).toEqual(ids.toReversed().slice(0, 20));
    expect(result.items[0]).toMatchObject({
      name: "สินค้า 25",
      price: 124,
      shopName: "บ้านสวนผ้าไทย",
      coverUrl: expect.stringContaining(".svg"),
    });
  });

  test("สินค้าที่ไม่มีรูปยังแสดงพร้อมชื่อ ราคา และชื่อร้าน", () => {
    for (let i = 0; i < 19; i++) product();
    product({ name: "เสื้อยืดสีขาว", price: 199, images: [] });

    const result = search();

    expect(result.items).toHaveLength(20);
    expect(result.items[0]).toMatchObject({ name: "เสื้อยืดสีขาว", price: 199, shopName: "บ้านสวนผ้าไทย", coverUrl: null });
  });
});

describe("BRW-002 ค้นหาด้วยคำค้น", () => {
  test("หาจากชื่อสินค้า ตัดช่องว่างหน้าหลัง สินค้าชื่อซ้ำจากคนละร้านแสดงแยกกัน", () => {
    const otherShop = addShop(db, { name: "ร้านเสื้อดี" }).id;
    for (let i = 0; i < 10; i++) product({ name: `เสื้อยืดลาย ${i}` });
    product({ name: "เสื้อยืดคอกลม" });
    product({ name: "เสื้อยืดคอกลม", shopId: otherShop });
    product({ name: "กางเกงยีนส์", description: "ใส่คู่กับเสื้อยืดได้" });

    const result = search({ q: " เสื้อยืด " });

    expect(result.total).toBe(12);
    const twins = result.items.filter((item) => item.name === "เสื้อยืดคอกลม");
    expect(twins.map((item) => item.shopName).sort()).toEqual(["บ้านสวนผ้าไทย", "ร้านเสื้อดี"].sort());
  });

  test("ไม่สนตัวพิมพ์เล็กใหญ่ของภาษาอังกฤษ และอักษร % กับ _ เป็นตัวอักษรธรรมดา", () => {
    product({ name: "USB Cable" });
    product({ name: "หูฟัง usb" });
    product({ name: "ลดราคา 50%" });
    product({ name: "ลดราคา 505" });

    expect(search({ q: "uSb" }).total).toBe(2);
    expect(search({ q: "50%" }).items.map((item) => item.name)).toEqual(["ลดราคา 50%"]);
    expect(search({ q: "_" }).total).toBe(0);
  });

  test("คำค้นว่างหรือมีแต่ช่องว่าง เห็นสินค้าทั้งหมด", () => {
    for (let i = 0; i < 3; i++) product();
    expect(search({ q: "" }).total).toBe(3);
    expect(search({ q: "     " }).total).toBe(3);
  });
});

describe("BRW-003 กรองตามหมวดหมู่", () => {
  test("แสดงเฉพาะหมวดที่เลือก โดยคงคำค้นไว้", () => {
    for (let i = 0; i < 8; i++) product({ name: `กระเป๋าผ้า ${i}`, categoryId: 2 });
    for (let i = 0; i < 22; i++) product({ name: `กระเป๋าดินสอ ${i}`, categoryId: 10 });
    product({ name: "รองเท้าแตะ", categoryId: 2 });

    expect(search({ q: "กระเป๋า" }).total).toBe(30);
    const result = search({ q: "กระเป๋า", category: "2" });
    expect(result.total).toBe(8);
    expect(result.category).toEqual({ id: 2, name: "กระเป๋าและรองเท้า" });
    expect(result.categoryNotFound).toBe(false);
  });

  test("หมวดหมู่ที่ไม่มีอยู่ ไม่แสดงสินค้าของหมวดอื่น", () => {
    product({ categoryId: 1 });

    for (const category of ["99", "abc"]) {
      const result = search({ category });
      expect(result.categoryNotFound).toBe(true);
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    }
  });
});

describe("BRW-004 กรองตามช่วงราคา", () => {
  beforeEach(() => {
    for (const price of [99, 100, 250, 500, 501]) product({ price });
  });

  const prices = (raw: RawSearchParams) =>
    search(raw)
      .items.map((item) => item.price)
      .sort((a, b) => a - b);

  test("นับรวมค่าขอบทั้งสองด้าน และกรอกค่าเดียวได้", () => {
    expect(prices({ min: "100", max: "500" })).toEqual([100, 250, 500]);
    expect(prices({ min: "250" })).toEqual([250, 500, 501]);
    expect(prices({ max: "100" })).toEqual([99, 100]);
  });

  test("ใช้ราคาต่ำสุดของแบบย่อย", () => {
    product({
      name: "เสื้อยืดคอกลม",
      options: [{ name: "สี", values: ["แดง", "ดำ"] }],
      variants: [{ price: 450 }, { price: 50 }],
    });
    expect(search({ max: "60" }).items.map((item) => item.name)).toEqual(["เสื้อยืดคอกลม"]);
  });

  test("ราคาต่ำสุดมากกว่าราคาสูงสุด ไม่กรองราคาและบอกข้อความ", () => {
    const result = search({ min: "500", max: "100" });
    expect(result.priceError).toBe("ราคาต่ำสุดต้องไม่มากกว่าราคาสูงสุด");
    expect(result.total).toBe(5);
  });
});

describe("BRW-005 เรียงลำดับ", () => {
  test("ราคาต่ำไปสูง ราคาเท่ากันให้สินค้าที่ลงขายใหม่กว่าขึ้นก่อน", () => {
    const old150 = product({ price: 150 }).id;
    product({ price: 3900 });
    const new150 = product({ price: 150 }).id;
    product({ price: 990 });

    const asc = search({ sort: "price-asc" }).items;
    expect(asc.map((item) => item.price)).toEqual([150, 150, 990, 3900]);
    expect(asc.slice(0, 2).map((item) => item.id)).toEqual([new150, old150]);

    const desc = search({ sort: "price-desc" }).items;
    expect(desc.map((item) => item.price)).toEqual([3900, 990, 150, 150]);
    expect(desc.slice(2).map((item) => item.id)).toEqual([new150, old150]);
  });

  test("การเรียงที่ระบบไม่มี เรียงแบบใหม่ล่าสุด", () => {
    const ids = [product({ price: 300 }).id, product({ price: 100 }).id, product({ price: 200 }).id];
    expect(search({ sort: "cheapest" }).items.map((item) => item.id)).toEqual(ids.toReversed());
  });
});

describe("BRW-006 แบ่งหน้าผลลัพธ์", () => {
  test("45 รายการ หน้า 3 มี 5 รายการ", () => {
    for (let i = 0; i < 45; i++) product({ name: `แก้วน้ำ ${i}` });

    const result = search({ q: "แก้ว", page: "3" });

    expect(result).toMatchObject({ page: 3, totalPages: 3, total: 45 });
    expect(result.items).toHaveLength(5);
  });

  test("สินค้าถูกซ่อนจนหน้าที่ขอไม่มีแล้ว แสดงหน้าสุดท้ายที่มีอยู่จริง", () => {
    const ids = Array.from({ length: 45 }, (_, i) => product({ name: `แก้วน้ำ ${i}` }).id);
    db.prepare(`UPDATE products SET status = 'ซ่อน' WHERE id IN (${ids.slice(0, 6).join(",")})`).run();

    const result = search({ q: "แก้ว", page: "3" });

    expect(result).toMatchObject({ page: 2, totalPages: 2, total: 39 });
    expect(result.items).toHaveLength(19);
    expect(result.items.map((item) => item.id)).not.toContain(ids[0]);
  });
});

describe("BRW-007 แสดงเฉพาะสินค้าที่ซื้อได้", () => {
  test("ไม่แสดงสินค้าที่ซ่อน ร่าง หรือลบแล้ว แต่ยังแสดงสินค้าที่หมด", () => {
    for (let i = 0; i < 19; i++) product({ name: `ผ้าไหม ${i}` });
    product({ name: "ผ้าไหมหมด", stock: 0 });
    for (const status of ["ซ่อน", "ร่าง", "ลบแล้ว"] as const) product({ name: `ผ้าไหม${status}`, status });

    const result = search({ q: "ผ้าไหม" });

    expect(result.total).toBe(20);
    expect(result.items.find((item) => item.name === "ผ้าไหมหมด")?.soldOut).toBe(true);
    expect(result.items.find((item) => item.name === "ผ้าไหม 0")?.soldOut).toBe(false);
  });

  test("ร้านถูกระงับแล้ว สินค้าทั้งร้านหายจากผลการค้นหาในคำขอถัดไป", () => {
    for (let i = 0; i < 20; i++) product({ name: `ผ้าพันคอ ${i}` });
    expect(search({ q: "ผ้าพันคอ" }).total).toBe(20);

    db.prepare("UPDATE shops SET status = 'ถูกระงับ' WHERE id = ?").run(shopId);

    expect(search({ q: "ผ้าพันคอ" }).total).toBe(0);
  });

  test("แบบย่อยที่เลิกใช้แล้วไม่นับราคาและสต็อก", () => {
    const { variantIds } = product({
      name: "หมวก",
      options: [{ name: "สี", values: ["แดง", "ดำ"] }],
      variants: [
        { price: 10, stock: 5 },
        { price: 300, stock: 0 },
      ],
    });
    db.prepare("UPDATE variants SET removed_at = ? WHERE id = ?").run(new Date().toISOString(), variantIds[0]);

    expect(search({ q: "หมวก" }).items[0]).toMatchObject({ price: 300, soldOut: true });
  });
});

describe("BRW-011 หน้าว่าง", () => {
  test("คำค้นไม่ตรงกับสินค้าใดเลย", () => {
    product({ name: "โคมไฟ" });
    expect(search({ q: "ยานอวกาศ" })).toMatchObject({ total: 0, totalPages: 0, items: [], categoryNotFound: false });
  });

  test("ระบบไม่มีสินค้าที่เห็นได้เลย", () => {
    db.prepare("UPDATE shops SET status = 'ถูกระงับ'").run();
    product();
    expect(search()).toMatchObject({ total: 0, items: [] });
  });
});

describe("BRW-012 คำขอซ้ำ", () => {
  test("กดค้นหาคำเดิมซ้ำ ได้ผลลัพธ์ชุดเดียวกัน และไม่มีรายการซ้ำข้ามหน้า", () => {
    for (let i = 0; i < 45; i++) product({ name: `โคมไฟ ${i}`, price: 100 + (i % 3) });

    const first = search({ q: "โคมไฟ", sort: "price-asc" });
    expect(search({ q: "โคมไฟ", sort: "price-asc" })).toEqual(first);

    const ids = [1, 2, 3].flatMap((page) => search({ q: "โคมไฟ", sort: "price-asc", page: String(page) }).items.map((i) => i.id));
    expect(new Set(ids).size).toBe(45);
  });
});

describe("BRW-Q02 ผลลัพธ์ตรงกับเงื่อนไขครบทุกรายการ", () => {
  test("SNT-007 คำค้นหลายคำ ชื่อสินค้าต้องมีทุกคำ คำเรียงสลับกันได้", () => {
    product({ name: "รองเท้าแตะ กันน้ำ" });
    product({ name: "รองเท้าหนัง หนังแท้" });
    product({ name: "กระเป๋าเป้ กันน้ำ" });

    expect(search({ q: "รองเท้า กันน้ำ" }).items.map((item) => item.name)).toEqual(["รองเท้าแตะ กันน้ำ"]);
    expect(search({ q: "กันน้ำ   รองเท้า" }).total).toBe(1);
    expect(search({ q: "รองเท้า ผ้าใบ" }).total).toBe(0);
  });

  test("SNT-Q01 ประโยคได้ผลลัพธ์ชุดเดียวกับการเลือกตัวกรองเอง", () => {
    const categories = [
      { id: 1, name: "เสื้อผ้าและแฟชั่น" },
      { id: 2, name: "กระเป๋าและรองเท้า" },
    ];
    const names = ["รองเท้าแตะ กันน้ำ", "รองเท้าหนัง", "เสื้อยืด", "กระเป๋าเป้ กันน้ำ"];
    for (let i = 0; i < 40; i++) product({ name: `${names[i % 4]} ${i}`, categoryId: (i % 2) + 1, price: 50 + i * 30 });

    const cases: [string, RawSearchParams][] = [
      ["รองเท้าไม่เกิน 500", { q: "รองเท้า", max: "500" }],
      ["รองเท้า กันน้ำ ต่ำกว่า 1 พัน ถูกสุด", { q: "รองเท้า กันน้ำ", max: "999", sort: "price-asc" }],
      ["หมวดรองเท้า 200 ถึง 800 บาท แพงสุด", { category: "2", min: "200", max: "800", sort: "price-desc" }],
      ["เสื้อผ้าและแฟชั่น ตั้งแต่ 5 ร้อย", { category: "1", min: "500" }],
      ["กันน้ำ 1k ขึ้นไป", { q: "กันน้ำ", min: "1000" }],
    ];
    for (const [text, raw] of cases) {
      const sentence = readSentence(text, categories);
      expect(sentence, text).not.toBeNull();
      const got = searchProducts(db, { ...parseBrowseParams({}), ...sentence });
      const expected = search(raw);
      expect(expected.total, text).toBeGreaterThan(0);
      expect(got.items.map((item) => item.id), text).toEqual(expected.items.map((item) => item.id));
      expect(got.total, text).toBe(expected.total);
    }
  });

  test("ทุกชุดคำค้นและตัวกรอง ได้รายการเดียวกับการนับเอง", () => {
    const suspended = addShop(db, { status: "ถูกระงับ" }).id;
    const names = ["เสื้อ Polo", "เสื้อยืด", "กางเกง", "หมวก POLO", "ถุงเท้า"];
    const all = Array.from({ length: 60 }, (_, i) => {
      const input = {
        name: `${names[i % names.length]} ${i}`,
        categoryId: (i % 3) + 1,
        price: (i * 37) % 700,
        status: i % 11 === 0 ? ("ซ่อน" as const) : ("ขายอยู่" as const),
        shopId: i % 13 === 0 ? suspended : shopId,
      };
      return { ...input, id: product(input).id };
    });
    const cases: RawSearchParams[] = [
      {},
      { q: "polo" },
      { q: "เสื้อ", category: "1" },
      { min: "100", max: "400" },
      { q: "หมวก", min: "0", max: "200", sort: "price-desc" },
      { category: "3", sort: "price-asc" },
    ];

    for (const raw of cases) {
      const params = parseBrowseParams(raw);
      const expected = all
        .filter((p) => p.status === "ขายอยู่" && p.shopId === shopId)
        .filter((p) => !params.q || p.name.toLowerCase().includes(params.q.toLowerCase()))
        .filter((p) => !params.category || String(p.categoryId) === params.category)
        .filter((p) => (params.min === null || p.price >= params.min) && (params.max === null || p.price <= params.max))
        .map((p) => p.id)
        .sort((a, b) => a - b);
      const got = [];
      for (let page = 1; ; page++) {
        const result = searchProducts(db, { ...params, page });
        got.push(...result.items.map((item) => item.id));
        if (page >= result.totalPages) break;
      }
      expect(got.toSorted((a, b) => a - b), JSON.stringify(raw)).toEqual(expected);
    }
  });
});

describe("BRW-Q04 ความสดของข้อมูล", () => {
  test("BRW-Q04 ซ่อนสินค้าหรือระงับร้าน แล้วสินค้าหายจากผลค้นหาและหน้ารายละเอียดในคำขอถัดไป เพราะทุกหน้าอ่านฐานข้อมูลใหม่ทุกครั้ง", () => {
    const hidden = product({ name: "ผ้าคลุมไหล่" });
    const other = addProduct(db, { shopId: addShop(db).id, name: "ผ้าคลุมไหล่ลายดอก" });
    expect(search({ q: "ผ้าคลุมไหล่" }).total).toBe(2);

    db.prepare("UPDATE products SET status = 'ซ่อน' WHERE id = ?").run(hidden.id);
    expect(search({ q: "ผ้าคลุมไหล่" }).items.map((item) => item.id)).toEqual([other.id]);
    expect(getProductDetail(db, hidden.id)).toBeNull();

    db.prepare("UPDATE shops SET status = 'ถูกระงับ' WHERE id = ?").run(other.shopId);
    expect(search({ q: "ผ้าคลุมไหล่" }).total).toBe(0);
    expect(getProductDetail(db, other.id)).toBeNull();
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("BRW-Q03 ใช้บนมือถือได้", () => {
  test("BRW-Q03 สไตล์ของหน้าแรก หน้าผลลัพธ์ และหน้ารายละเอียด ไม่มีความกว้างตายตัวเกินจอ 360 จุด และปุ่มเลือกตัวเลือกกว้างอย่างน้อย 44 จุด", () => {
    const css = readFileSync(join(process.cwd(), "src/features/browse/components/browse.module.css"), "utf8");
    const widths = [...css.matchAll(/(?:^|[\s;{])(?:min-)?width:\s*(\d+)px/g)].map((match) => Number(match[1]));
    const globals = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(widths.filter((width) => width > 328)).toEqual([]);
    expect(css).toMatch(/\.choice \{[^}]*min-width: var\(--tap\)/);
    expect(globals).toMatch(/--tap: 44px/);
    expect(globals).toMatch(/\.button \{[^}]*min-height: var\(--tap\)/);
  });
});
