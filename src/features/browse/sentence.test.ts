import { describe, expect, test } from "vitest";
import { readSentence, understoodLabels } from "@/features/browse/sentence";

const categories = [
  { id: 1, name: "เสื้อผ้าและแฟชั่น" },
  { id: 2, name: "กระเป๋าและรองเท้า" },
  { id: 3, name: "ความงามและของใช้ส่วนตัว" },
  { id: 6, name: "บ้านและของใช้ในบ้าน" },
  { id: 8, name: "แม่และเด็ก" },
  { id: 11, name: "สัตว์เลี้ยง" },
];

const read = (text: string) => readSentence(text, categories);

describe("readSentence", () => {
  test("SNT-001 ราคาสูงสุด นับรวมหรือไม่รวมค่าขอบตามคำที่ใช้", () => {
    expect(read("รองเท้าไม่เกิน 500")).toEqual({ q: "รองเท้า", max: 500 });
    expect(read("รองเท้า ราคาไม่เกิน 500 บาท")).toEqual({ q: "รองเท้า", max: 500 });
    expect(read("งบ 300 เสื้อยืด")).toEqual({ q: "เสื้อยืด", max: 300 });
    expect(read("กระเป๋าต่ำกว่า 500")).toEqual({ q: "กระเป๋า", max: 499 });
    expect(read("กระเป๋าถูกกว่า ฿500")).toEqual({ q: "กระเป๋า", max: 499 });
    expect(read("ไม่ถึง 100 บ.")).toEqual({ q: "", max: 99 });
  });

  test("SNT-002 ราคาต่ำสุด", () => {
    expect(read("หูฟังตั้งแต่ 1000")).toEqual({ q: "หูฟัง", min: 1000 });
    expect(read("หูฟัง 1000 บาทขึ้นไป")).toEqual({ q: "หูฟัง", min: 1000 });
    expect(read("หูฟังมากกว่า 1000")).toEqual({ q: "หูฟัง", min: 1001 });
    expect(read("หูฟังเกิน 1000 บาท")).toEqual({ q: "หูฟัง", min: 1001 });
    expect(read("หูฟังอย่างน้อย 1000")).toEqual({ q: "หูฟัง", min: 1000 });
    expect(read("หูฟังตั้งแต่ 2 ล้าน")).toEqual({ q: "หูฟัง", min: 2000000 });
  });

  test("SNT-003 ช่วงราคา", () => {
    expect(read("เสื้อ 100 ถึง 300 บาท")).toEqual({ q: "เสื้อ", min: 100, max: 300 });
    expect(read("เสื้อ ราคา 100-300")).toEqual({ q: "เสื้อ", min: 100, max: 300 });
    expect(read("เสื้อ 100-300 บาท")).toEqual({ q: "เสื้อ", min: 100, max: 300 });
    expect(read("ระหว่าง 100 กับ 300 เสื้อ")).toEqual({ q: "เสื้อ", min: 100, max: 300 });
    expect(read("เสื้อตั้งแต่ 100 ไม่เกิน 300")).toEqual({ q: "เสื้อ", min: 100, max: 300 });
  });

  test("SNT-003 ช่วงที่กลับด้านส่งต่อตามที่พิมพ์ ให้หน้าผลลัพธ์บอกข้อผิดพลาด", () => {
    expect(read("เสื้อ 500 ถึง 100")).toEqual({ q: "เสื้อ", min: 500, max: 100 });
  });

  test("SNT-004 ตัวเลขมีจุลภาค เลขไทย และหน่วยร้อย พัน หมื่น แสน ล้าน k", () => {
    expect(read("ไม่เกิน 1,500")).toEqual({ q: "", max: 1500 });
    expect(read("ไม่เกิน ๕๐๐")).toEqual({ q: "", max: 500 });
    expect(read("ไม่เกิน 5 ร้อย")).toEqual({ q: "", max: 500 });
    expect(read("ไม่เกิน 2พัน")).toEqual({ q: "", max: 2000 });
    expect(read("ไม่เกิน 1.5 หมื่นบาท")).toEqual({ q: "", max: 15000 });
    expect(read("ไม่เกิน 2 แสน")).toEqual({ q: "", max: 200000 });
    expect(read("ไม่เกิน 1 ล้าน")).toEqual({ q: "", max: 1000000 });
    expect(read("ไม่เกิน 1.5k")).toEqual({ q: "", max: 1500 });
    expect(read("ไม่เกิน 99.50")).toEqual({ q: "", max: 99 });
    expect(read("ตั้งแต่ 99.50")).toEqual({ q: "", min: 100 });
  });

  test("SNT-005 การเรียง", () => {
    expect(read("รองเท้าถูกสุด")).toEqual({ q: "รองเท้า", sort: "price-asc" });
    expect(read("รองเท้า เรียงจากถูกที่สุดก่อน")).toEqual({ q: "รองเท้า", sort: "price-asc" });
    expect(read("แพงสุด นาฬิกา")).toEqual({ q: "นาฬิกา", sort: "price-desc" });
    expect(read("นาฬิกาใหม่ล่าสุด")).toEqual({ q: "นาฬิกา", sort: "newest" });
    expect(read("นาฬิกามาใหม่")).toEqual({ q: "นาฬิกา", sort: "newest" });
  });

  test("SNT-006 หมวดหมู่ เมื่อพิมพ์คำว่าหมวดหรือพิมพ์ชื่อหมวดหมู่เต็ม", () => {
    expect(read("หมวดรองเท้า ไม่เกิน 500")).toEqual({ q: "", category: "2", max: 500 });
    expect(read("กันน้ำ หมวดหมู่ กระเป๋าและรองเท้า")).toEqual({ q: "กันน้ำ", category: "2" });
    expect(read("ของเล่น แม่และเด็ก")).toEqual({ q: "ของเล่น", category: "8" });
    expect(read("หมวดของใช้ในบ้าน")).toEqual({ q: "", category: "6" });
    expect(read("หมวดของใช้ส่วนตัว")).toEqual({ q: "", category: "3" });
  });

  test("SNT-006 ชื่อบางส่วนของหมวดหมู่ที่ไม่มีคำว่าหมวด ยังเป็นคำค้น", () => {
    expect(read("รองเท้า")).toBeNull();
    expect(read("บ้านตุ๊กตา")).toBeNull();
    expect(read("อาหารสัตว์เลี้ยง")).toBeNull();
  });

  test("SNT-006 หมวดที่ไม่รู้จัก ยังเป็นคำค้นตามที่พิมพ์", () => {
    expect(read("หมวดรถยนต์")).toBeNull();
  });

  test("หลายอย่างในประโยคเดียว", () => {
    expect(read("รองเท้า กันน้ำ ไม่เกิน 1 พัน ถูกสุด")).toEqual({ q: "รองเท้า กันน้ำ", max: 1000, sort: "price-asc" });
    expect(read("หมวดสัตว์เลี้ยง 100 ถึง 500 แพงสุด")).toEqual({ q: "", category: "11", min: 100, max: 500, sort: "price-desc" });
  });

  test("SNT-009 ไม่เข้าใจอะไรเลย ได้ null และคำค้นใช้ตามที่พิมพ์", () => {
    for (const text of ["", "เสื้อยืด", "สาย USB 2 เมตร", "iPhone 12-13", "เบอร์ 42", "ราคา", "ไม่เกิน", "เกินคุ้ม", "ถูก", "ไม่เกิน ห้าร้อย", "ขอของดีๆ หน่อย"]) {
      expect(read(text), text).toBeNull();
    }
  });

  test("อ่านซ้ำกับผลของตัวเองแล้วไม่เข้าใจอะไรเพิ่ม", () => {
    for (const text of ["รองเท้าไม่เกิน 500 ถูกสุด", "หมวดรองเท้า 100 ถึง 300", "ไม่ ถูกสุด เกิน 500"]) {
      const once = read(text);
      expect(once, text).not.toBeNull();
      expect(read(once!.q), text).toBeNull();
    }
  });
});

describe("understoodLabels", () => {
  test("SNT-011 บอกสิ่งที่เข้าใจเป็นคำสั้นๆ ตามลำดับ คำค้น หมวดหมู่ ราคา การเรียง", () => {
    expect(understoodLabels(read("รองเท้า หมวดรองเท้า ไม่เกิน 500 ถูกสุด")!, categories)).toEqual([
      "“รองเท้า”",
      "กระเป๋าและรองเท้า",
      "ราคาไม่เกิน ฿500",
      "เรียงราคาต่ำไปสูง",
    ]);
    expect(understoodLabels(read("100 ถึง 300")!, categories)).toEqual(["ราคา ฿100 ถึง ฿300"]);
    expect(understoodLabels(read("ตั้งแต่ 100")!, categories)).toEqual(["ราคาตั้งแต่ ฿100"]);
  });
});
