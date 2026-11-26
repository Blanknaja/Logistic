// คะแนนในรายการสินค้า: การ์ด การเรียง ตัวกรอง และการอ่านประโยค (REV-009 ถึง REV-012) ใช้โมดูลจริงของ browse และ shop
import { beforeEach, describe, expect, test } from "vitest";
import { searchPreview } from "@/features/browse/components/search-bar";
import { parseBrowseParams, type RawSearchParams } from "@/features/browse/search-params";
import { readSentence, understoodLabels } from "@/features/browse/sentence";
import { searchProducts } from "@/features/browse/server/search";
import { displayedAverage } from "@/features/review/rules";
import { writeReview } from "@/features/review/server/fixtures";
import { hideReview } from "@/features/review/server/reviews";
import { listStorefrontProducts } from "@/features/shop/server/storefront";
import type { Db } from "@/shared/db";
import { addAccount, addOrder, addProduct, addShop, type ProductInput } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";
import { ORDER_STATUS } from "@/shared/statuses";

let db: Db;
let shopId: number;
let buyer: number;
let admin: number;
let minute = 0;

beforeEach(() => {
  db = createTestDb();
  shopId = addShop(db, { name: "มานะสปอร์ต" }).id;
  buyer = addAccount(db).id;
  admin = addAccount(db, { isAdmin: true }).id;
  minute = 0;
});

/** ลงขายทีละรายการ รายการที่เพิ่มทีหลังใหม่กว่า ratings คือคะแนนของรีวิวที่แสดงอยู่ของสินค้านี้ */
function product(input: ProductInput = {}, ratings: number[] = []) {
  minute += 1;
  const created = addProduct(db, { shopId, createdAt: new Date(Date.UTC(2026, 10, 24, 0, minute)).toISOString(), ...input });
  const reviewIds = ratings.map((rating) => review(created.variantIds[0], rating));
  return { ...created, reviewIds };
}

function review(variantId: number, rating: number): number {
  const order = addOrder(db, { buyerAccountId: buyer, items: [{ variantId }], status: ORDER_STATUS.completed });
  const itemId = Number(db.prepare("SELECT id FROM order_items WHERE order_id = ?").get(order.id)?.id);
  return writeReview(db, { orderItemId: itemId, rating }).id;
}

/** รีวิว count รีวิวที่รวมได้ sum ดาว */
const ratingsOf = (count: number, sum: number) => Array.from({ length: count }, (_, i) => Math.floor(sum / count) + (i < sum % count ? 1 : 0));

const search = (raw: RawSearchParams = {}) => searchProducts(db, parseBrowseParams(raw));
const categories = [
  { id: 1, name: "เสื้อผ้าและแฟชั่น" },
  { id: 2, name: "กระเป๋าและรองเท้า" },
];
const read = (text: string) => readSentence(text, categories);

describe("REV-009 คะแนนบนการ์ดสินค้า", () => {
  test("REV-009 การ์ดในผลการค้นหาและหน้าร้านมีคะแนนเฉลี่ยกับจำนวนรีวิว สินค้าที่ไม่มีรีวิวไม่มีช่องคะแนน", () => {
    const football = product({ name: "ลูกฟุตบอล", price: 350 }, ratingsOf(128, 550));
    const racket = product({ name: "ไม้แบดมินตัน", price: 590 });

    for (const items of [search({ q: "" }).items, listStorefrontProducts(db, shopId).items]) {
      expect(items.find((item) => item.id === football.id)?.rating).toEqual({ average: 4.3, count: 128 });
      const plain = items.find((item) => item.id === racket.id);
      expect(plain).toMatchObject({ name: "ไม้แบดมินตัน", price: 590 });
      expect(plain && "rating" in plain).toBe(false);
    }
  });

  test("REV-009 รีวิวเดียวของสินค้าถูกซ่อน การ์ดไม่มีคะแนน ส่วนอื่นยังครบ", () => {
    const football = product({ name: "ลูกฟุตบอล", price: 350 }, [5]);
    hideReview(db, { adminAccountId: admin, reviewId: football.reviewIds[0], reason: "ไม่เหมาะสม" });

    const card = search().items[0];
    expect(card).toMatchObject({ id: football.id, name: "ลูกฟุตบอล", price: 350, shopName: "มานะสปอร์ต", soldOut: false });
    expect(card).not.toHaveProperty("rating");
    expect(listStorefrontProducts(db, shopId).items[0]).not.toHaveProperty("rating");
  });

  test("REV-Q02 คะแนนบนการ์ดของสินค้า 20 รายการตรงกับค่าที่คิดจากรายการรีวิว รวมกรณี 4.25 ที่ปัดเป็น 4.3", () => {
    const products = Array.from({ length: 20 }, (_, i) => product({}, i === 0 ? [5, 4, 4, 4] : ratingsOf(1 + (i % 7), 1 + (i % 7) + ((i * 5) % (4 * (1 + (i % 7)) + 1)))));
    const cards = new Map(search().items.map((item) => [item.id, item.rating]));

    expect(cards.get(products[0].id)).toEqual({ average: 4.3, count: 4 });
    for (const item of products) {
      const ratings = (db.prepare("SELECT rating FROM reviews WHERE product_id = ? AND status = 'แสดงอยู่'").all(item.id) as { rating: number }[]).map(
        (row) => row.rating,
      );
      const sum = ratings.reduce((total, value) => total + value, 0);
      expect(cards.get(item.id)).toEqual({ average: Math.round((sum * 10) / ratings.length) / 10, count: ratings.length });
      expect(cards.get(item.id)?.average).toBe(displayedAverage(sum, ratings.length));
    }
  });
});

describe("REV-010 เรียงตามคะแนนสูงสุด", () => {
  test("REV-010 คะแนนมากก่อน เท่ากันให้รีวิวมากกว่าขึ้นก่อน ไม่มีรีวิวอยู่ท้ายสุด โดยคงคำค้นไว้", () => {
    const a = product({ name: "รองเท้า ก" }, ratingsOf(5, 24)).id;
    const b = product({ name: "รองเท้า ข" }, ratingsOf(40, 192)).id;
    const c = product({ name: "รองเท้า ค" }, ratingsOf(200, 780)).id;
    const d = product({ name: "รองเท้า ง" }).id;
    product({ name: "เสื้อ" }, [5]);

    const result = search({ q: "รองเท้า", sort: "rating" });
    expect(result.items.map((item) => item.id)).toEqual([b, a, c, d]);
    expect(result.items.map((item) => item.rating?.average)).toEqual([4.8, 4.8, 3.9, undefined]);
  });

  test("REV-010 คะแนนและจำนวนรีวิวเท่ากันให้สินค้าที่ลงขายใหม่กว่าขึ้นก่อน และสินค้าที่ไม่มีรีวิวเรียงจากใหม่กว่า", () => {
    const oldRated = product({}, [4]).id;
    const oldPlain = product().id;
    const newRated = product({}, [4]).id;
    const newPlain = product().id;
    expect(search({ sort: "rating" }).items.map((item) => item.id)).toEqual([newRated, oldRated, newPlain, oldPlain]);
  });

  test("REV-010 เรียงด้วยคะแนนที่ปัดแล้ว 4.25 กับ 4.3 จึงเท่ากันและดูจำนวนรีวิวต่อ", () => {
    const fewer = product({}, [5, 4, 4, 4]).id;
    const more = product({}, ratingsOf(10, 43)).id;
    expect(search({ sort: "rating" }).items.map((item) => item.id)).toEqual([more, fewer]);
  });

  test("REV-010 ค้นหาไม่พบสินค้าแล้วเรียงตามคะแนน ได้ผลลัพธ์ว่างโดยไม่ผิดพลาด", () => {
    product({ name: "รองเท้า" }, [5]);
    expect(search({ q: "ยานอวกาศ", sort: "rating" })).toMatchObject({ items: [], total: 0 });
  });
});

describe("REV-011 กรองตามคะแนนขั้นต่ำ", () => {
  const headphones = () => ({
    top: product({ name: "หูฟัง A", price: 590 }, ratingsOf(5, 23)).id,
    four: product({ name: "หูฟัง B", price: 890 }, [4, 4]).id,
    below: product({ name: "หูฟัง C", price: 300 }, ratingsOf(10, 39)).id,
    plain: product({ name: "หูฟัง D", price: 1500 }).id,
  });

  test("REV-011 4 ดาวขึ้นไป เห็นเฉพาะคะแนน 4.6 กับ 4.0 ไม่รวมสินค้าที่ไม่มีรีวิว และเอาตัวกรองออกแล้วเห็น 4 รายการ", () => {
    const ids = headphones();
    const filtered = search({ q: "หูฟัง", rating: "4" });
    expect(filtered.total).toBe(2);
    expect(filtered.items.map((item) => item.id).sort()).toEqual([ids.top, ids.four].sort());
    expect(filtered.items.map((item) => item.rating?.average).sort()).toEqual([4, 4.6]);
    expect(search({ q: "หูฟัง" }).total).toBe(4);
  });

  test("REV-011 ใช้คะแนนที่ปัดแล้ว และคงหมวดหมู่ ช่วงราคา กับการเรียงไว้", () => {
    const ids = headphones();
    const rounded = product({ name: "หูฟัง E", price: 700 }, ratingsOf(20, 79)).id;
    expect(search({ q: "หูฟัง", rating: "4", max: "800", sort: "price-desc" }).items.map((item) => item.id)).toEqual([rounded, ids.top]);
    expect(search({ rating: "5" }).total).toBe(0);
    expect(search({ rating: "1" }).total).toBe(4);
  });

  test("REV-011 คะแนนขั้นต่ำที่เป็น 9 หรือตัวอักษร ได้ผลลัพธ์ที่ไม่ถูกกรองตามคะแนน", () => {
    headphones();
    expect(search({ q: "หูฟัง", rating: "9" }).total).toBe(4);
    expect(search({ q: "หูฟัง", rating: "สี่" }).total).toBe(4);
  });
});

describe("REV-012 คะแนนขั้นต่ำและการเรียงตามคะแนนจากประโยค", () => {
  test("REV-012 REV-Q06 ประโยคเรื่องคะแนนอ่านได้ค่าตรงกับที่กำหนด", () => {
    const cases: [string, ReturnType<typeof read>][] = [
      ["หูฟัง 4 ดาวขึ้นไป ไม่เกิน 1000", { q: "หูฟัง", rating: 4, max: 1000 }],
      ["หูฟัง คะแนน 4 ขึ้นไป ไม่เกิน 1000", { q: "หูฟัง", rating: 4, max: 1000 }],
      ["หูฟัง คะแนนตั้งแต่ 3 ขึ้นไป", { q: "หูฟัง", rating: 3 }],
      ["หูฟังตั้งแต่ 4 ดาว", { q: "หูฟัง", rating: 4 }],
      ["ตั้งแต่ ๕ ดาว รองเท้า", { q: "รองเท้า", rating: 5 }],
      ["รองเท้า ๔ ดาวขึ้นไป", { q: "รองเท้า", rating: 4 }],
      ["รองเท้า 2  ดาว  ขึ้นไป", { q: "รองเท้า", rating: 2 }],
      ["คะแนน 1 ดาวขึ้นไป หมวดรองเท้า", { q: "", category: "2", rating: 1 }],
      ["รองเท้า คะแนนสูงสุด", { q: "รองเท้า", sort: "rating" }],
      ["รองเท้า เรียงตามคะแนนดีที่สุด", { q: "รองเท้า", sort: "rating" }],
      ["รองเท้า เรียงจากรีวิวดีสุดก่อน", { q: "รองเท้า", sort: "rating" }],
      ["รีวิวดีที่สุด หูฟัง 100 ถึง 500 บาท", { q: "หูฟัง", min: 100, max: 500, sort: "rating" }],
      ["หูฟัง คะแนนดีสุด 4 ดาวขึ้นไป ตั้งแต่ 500", { q: "หูฟัง", rating: 4, min: 500, sort: "rating" }],
    ];
    expect(cases.length).toBeGreaterThanOrEqual(12);
    for (const [text, expected] of cases) expect(read(text), text).toEqual(expected);
  });

  test("REV-012 REV-Q06 ข้อความที่ต้องไม่อ่านเป็นคะแนน", () => {
    for (const text of ["ผ้าขนหนู 5 ดาว", "โรงแรม 5 ดาว ผ้าขนหนู", "หูฟัง คะแนน 6 ขึ้นไป", "หูฟัง 0 ดาวขึ้นไป", "หูฟัง คะแนน 4.5 ขึ้นไป", "คะแนนตั้งแต่ 4", "ดาว", "คะแนน"]) {
      expect(read(text), text).toBeNull();
    }
    expect(read("500 ขึ้นไป")).toEqual({ q: "", min: 500 });
    expect(read("โรงแรม 5 ดาว ไม่เกิน 500")).toEqual({ q: "โรงแรม 5 ดาว", max: 500 });
    expect(read("ผ่อน 0 ดาวน์ ตั้งแต่ 500")).toEqual({ q: "ผ่อน 0 ดาวน์", min: 500 });
  });

  test("REV-012 แถบบอกก่อนกดค้นหาแสดงคะแนนขั้นต่ำและการเรียงตามคะแนนต่อจากส่วนอื่น", () => {
    expect(understoodLabels(read("หูฟัง 4 ดาวขึ้นไป ไม่เกิน 1000 คะแนนสูงสุด")!, categories)).toEqual([
      "“หูฟัง”",
      "ราคาไม่เกิน ฿1,000",
      "คะแนน 4 ดาวขึ้นไป",
      "เรียงคะแนนสูงสุด",
    ]);
    expect(searchPreview("หูฟัง 5 ดาวขึ้นไป", categories)).toEqual({ lead: "จะค้นหา", detail: "“หูฟัง” · คะแนน 5 ดาว" });
    expect(searchPreview("ผ้าขนหนู 5 ดาว", categories)).toBeNull();
  });

  test("REV-012 REV-Q06 ผลลัพธ์ของประโยคตรงกับผลลัพธ์ของตัวกรองที่เลือกเอง และไม่มีราคาต่ำสุด 4 บาทถูกใช้", () => {
    const cheap = product({ name: "หูฟัง A", price: 590 }, ratingsOf(5, 23)).id;
    const mid = product({ name: "หูฟัง B", price: 890 }, [4, 4]).id;
    product({ name: "หูฟัง C", price: 1500 }, ratingsOf(10, 49));
    product({ name: "หูฟัง D", price: 300 }, ratingsOf(10, 39));
    product({ name: "หูฟัง E", price: 3 }, [5]);

    const cases: [string, RawSearchParams][] = [
      ["หูฟัง 4 ดาวขึ้นไป ไม่เกิน 1000", { q: "หูฟัง", rating: "4", max: "1000" }],
      ["หูฟัง คะแนน 4 ขึ้นไป ไม่เกิน 1000", { q: "หูฟัง", rating: "4", max: "1000" }],
      ["หูฟัง คะแนนสูงสุด", { q: "หูฟัง", sort: "rating" }],
    ];
    for (const [text, raw] of cases) {
      const got = searchProducts(db, { ...parseBrowseParams({}), ...read(text) });
      const expected = search(raw);
      expect(expected.total, text).toBeGreaterThan(0);
      expect(got.items.map((item) => item.id), text).toEqual(expected.items.map((item) => item.id));
    }
    const understood = searchProducts(db, { ...parseBrowseParams({}), ...read("หูฟัง 4 ดาวขึ้นไป ไม่เกิน 1000") });
    expect(understood.total).toBe(3);
    expect(understood.items.map((item) => item.id)).toEqual(expect.arrayContaining([cheap, mid]));
    expect(understood.items.some((item) => item.price === 3)).toBe(true);
  });

  test("REV-012 500 ขึ้นไป ยังเป็นราคาต่ำสุด 500 บาท", () => {
    product({ price: 499 });
    const kept = product({ price: 500 }).id;
    const got = searchProducts(db, { ...parseBrowseParams({}), ...read("500 ขึ้นไป") });
    expect(got.items.map((item) => item.id)).toEqual([kept]);
  });
});
