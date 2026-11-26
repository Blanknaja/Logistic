import { describe, expect, test } from "vitest";
import { browseHref, hasCriteria, parseBrowseParams, priceError, ratingLabel, SORT_LABELS } from "@/features/browse/search-params";

describe("parseBrowseParams", () => {
  test("BRW-002 ตัดช่องว่างหน้าหลังคำค้น", () => {
    expect(parseBrowseParams({ q: " เสื้อยืด " }).q).toBe("เสื้อยืด");
  });

  test("BRW-002 คำค้นว่างหรือมีแต่ช่องว่างเหมือนไม่ได้ใส่คำค้น และยาวได้ไม่เกิน 100 ตัวอักษร", () => {
    expect(parseBrowseParams({ q: "" }).q).toBe("");
    expect(parseBrowseParams({ q: "     " }).q).toBe("");
    expect(parseBrowseParams({ q: "ก".repeat(150) }).q).toHaveLength(100);
  });

  test("BRW-004 อ่านราคาที่เป็นตัวเลขล้วน ค่าอื่นถือว่าไม่ได้กรอก", () => {
    expect(parseBrowseParams({ min: "100", max: "500" })).toMatchObject({ min: 100, max: 500 });
    expect(parseBrowseParams({ min: "", max: "-5" })).toMatchObject({ min: null, max: null });
    expect(parseBrowseParams({ min: "1e3", max: "12.5" })).toMatchObject({ min: null, max: null });
  });

  test("BRW-005 การเรียงที่ระบบไม่มี ใช้ใหม่ล่าสุด", () => {
    expect(parseBrowseParams({ sort: "price-asc" }).sort).toBe("price-asc");
    expect(parseBrowseParams({ sort: "cheapest" }).sort).toBe("newest");
    expect(parseBrowseParams({ sort: "toString" }).sort).toBe("newest");
    expect(parseBrowseParams({}).sort).toBe("newest");
  });

  test("REV-010 การเรียงมีแบบที่สี่คือคะแนนสูงสุด", () => {
    expect(parseBrowseParams({ sort: "rating" }).sort).toBe("rating");
    expect(Object.values(SORT_LABELS)).toEqual(["ใหม่ล่าสุด", "ราคาต่ำไปสูง", "ราคาสูงไปต่ำ", "คะแนนสูงสุด"]);
  });

  test("REV-011 คะแนนขั้นต่ำรับเฉพาะ 1 ถึง 5 ค่าอื่นเช่น 9 หรือตัวอักษรถือว่าไม่ได้กรอง", () => {
    for (const rating of ["1", "4", "5"]) expect(parseBrowseParams({ rating }).rating).toBe(Number(rating));
    for (const rating of ["9", "0", "abc", "4.5", "", "-1", "44"]) expect(parseBrowseParams({ rating }).rating).toBeNull();
    expect(parseBrowseParams({}).rating).toBeNull();
  });

  test("BRW-006 เลขหน้าที่ใช้ไม่ได้ กลับไปหน้า 1", () => {
    expect(parseBrowseParams({ page: "3" }).page).toBe(3);
    for (const page of ["0", "-1", "abc", "2.5", ""]) expect(parseBrowseParams({ page }).page).toBe(1);
  });

  test("ค่าที่ซ้ำกันในที่อยู่หน้าเว็บ ใช้ค่าแรก", () => {
    expect(parseBrowseParams({ q: ["แก้ว", "จาน"], category: ["2", "3"] })).toMatchObject({ q: "แก้ว", category: "2" });
  });
});

describe("priceError", () => {
  test("BRW-004 ช่วงราคาที่ถูกต้องไม่มีข้อความ นับรวมค่าขอบ", () => {
    expect(priceError(100, 500)).toBeNull();
    expect(priceError(250, 250)).toBeNull();
    expect(priceError(250, null)).toBeNull();
    expect(priceError(0, 1_000_000)).toBeNull();
  });

  test("BRW-004 ราคาต่ำสุดมากกว่าราคาสูงสุด หรือเกิน 1,000,000 บาท", () => {
    expect(priceError(500, 100)).toBe("ราคาต่ำสุดต้องไม่มากกว่าราคาสูงสุด");
    expect(priceError(1_000_001, null)).toBe("ราคาต้องไม่เกิน 1,000,000 บาท");
  });
});

describe("ratingLabel", () => {
  test("REV-011 คะแนนขั้นต่ำเป็นคำ และนับเป็นตัวกรองที่ใช้อยู่", () => {
    expect(ratingLabel(4)).toBe("คะแนน 4 ดาวขึ้นไป");
    expect(ratingLabel(5)).toBe("คะแนน 5 ดาว");
    expect(ratingLabel(null)).toBeNull();
    expect(hasCriteria(parseBrowseParams({ rating: "3" }))).toBe(true);
    expect(hasCriteria(parseBrowseParams({ sort: "rating" }))).toBe(false);
  });
});

describe("browseHref", () => {
  test("BRW-006 ที่อยู่หน้าเว็บเก็บคำค้น ตัวกรอง การเรียง และเลขหน้าไว้ครบ", () => {
    const href = browseHref({ q: "ร่ม", category: "6", min: 100, max: 300, rating: 4, sort: "price-desc", page: 3 });
    expect(href).toBe("/?q=%E0%B8%A3%E0%B9%88%E0%B8%A1&category=6&min=100&max=300&rating=4&sort=price-desc&page=3");
    const [, query] = href.split("?");
    expect(parseBrowseParams(Object.fromEntries(new URLSearchParams(query)))).toEqual({
      q: "ร่ม",
      category: "6",
      min: 100,
      max: 300,
      rating: 4,
      sort: "price-desc",
      page: 3,
    });
  });

  test("ค่าเริ่มต้นไม่ถูกใส่ในที่อยู่ หน้าแรกจึงเป็น /", () => {
    expect(browseHref({})).toBe("/");
    expect(browseHref({ q: "", category: null, min: null, max: null, rating: null, sort: "newest", page: 1 })).toBe("/");
  });
});
