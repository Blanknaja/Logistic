import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { BrowseResults } from "@/features/browse/components/browse-results";
import { ResultsSkeleton } from "@/features/browse/components/skeletons";
import { parseBrowseParams, type RawSearchParams } from "@/features/browse/search-params";
import type { ProductCard, SearchResult } from "@/features/browse/server/search";

const categories = [
  { id: 1, name: "เสื้อผ้าและแฟชั่น" },
  { id: 2, name: "กระเป๋าและรองเท้า" },
];

const card = (id: number, input: Partial<ProductCard> = {}): ProductCard => ({
  id,
  name: `สินค้า ${id}`,
  price: 100,
  shopName: "บ้านสวนผ้าไทย",
  coverUrl: `/sample-images/p${id}-1.svg`,
  soldOut: false,
  ...input,
});

function render(raw: RawSearchParams, result: Partial<SearchResult>) {
  const full: SearchResult = {
    items: [],
    total: 0,
    page: 1,
    totalPages: 0,
    category: null,
    categoryNotFound: false,
    priceError: null,
    ...result,
  };
  return renderToStaticMarkup(<BrowseResults params={parseBrowseParams(raw)} result={full} categories={categories} />);
}

describe("BRW-001 หน้าแรก", () => {
  test("แสดงหมวดหมู่ จำนวนทั้งหมด และสินค้าพร้อมรูป ชื่อ ราคา ร้าน", () => {
    const items = Array.from({ length: 20 }, (_, i) => card(i + 1, { price: 1290 }));
    const html = render({}, { items, total: 1000, totalPages: 50 });

    expect(html).toContain("เสื้อผ้าและแฟชั่น");
    expect(html).toContain("พบ 1,000 รายการ");
    expect(html.match(/href="\/products\/\d+"/g)).toHaveLength(20);
    expect(html).toContain("฿1,290");
    expect(html).toContain("บ้านสวนผ้าไทย");
    expect(html).toContain('src="/sample-images/p1-1.svg"');
  });

  test('สินค้าที่ไม่มีรูปแสดงรูปแทนที่มีข้อความ "ไม่มีรูป" ส่วนที่เหลือแสดงครบ', () => {
    const items = [card(1, { name: "เสื้อยืดสีขาว", price: 199, coverUrl: null }), card(2)];
    const html = render({}, { items, total: 2, totalPages: 1 });

    expect(html).toContain("ไม่มีรูป");
    expect(html).toContain("เสื้อยืดสีขาว");
    expect(html).toContain("฿199");
    expect(html).toContain('src="/sample-images/p2-1.svg"');
  });

  test("สินค้าที่สต็อกเป็น 0 ยังแสดง พร้อมคำว่าสินค้าหมด", () => {
    const html = render({}, { items: [card(1, { soldOut: true })], total: 1, totalPages: 1 });
    expect(html).toContain("สินค้าหมด");
  });

  test("สโลแกนเหลือเป็นหัวเรื่องที่โปรแกรมอ่านจอได้ยิน หมวดหมู่เป็นแถบนำทาง และไม่มีช่องค้นหาซ้ำกับแถบด้านบน", () => {
    const html = render({}, { items: [card(1)], total: 1, totalPages: 1 });

    expect(html).toContain('<h1 class="visually-hidden">ซื้อของจากหลายร้านในที่เดียว</h1>');
    expect(html).toMatch(/<nav aria-label="หมวดหมู่"/);
    expect(html).not.toContain('name="q" value=""');
    expect(html).not.toContain('type="search"');
  });

  test("การ์ดสินค้ามีแค่รูป ชื่อ ราคา และชื่อร้าน", () => {
    const html = render({}, { items: [card(7, { name: "แก้วน้ำ", price: 59 })], total: 1, totalPages: 1 });
    const cardHtml = html.match(/<a[^>]*href="\/products\/7"[^>]*>(.*?)<\/a>/)?.[1] ?? "";
    const texts = cardHtml.replace(/<[^>]+>/g, "|").split("|").map((t) => t.trim()).filter(Boolean);

    expect(texts).toEqual(["แก้วน้ำ", "฿59", "บ้านสวนผ้าไทย"]);
    expect(cardHtml).toContain('src="/sample-images/p7-1.svg"');
  });
});

describe("BRW-003 กรองตามหมวดหมู่", () => {
  test("หมวดที่เลือกแสดงเด่น ลิงก์หมวดคงคำค้นไว้ และมีปุ่มล้างตัวกรองที่คงคำค้น", () => {
    const html = render(
      { q: "กระเป๋า", category: "2", page: "2" },
      { items: [card(1)], total: 8, totalPages: 1, category: categories[1] },
    );

    expect(html).toMatch(/aria-current="page"[^>]*>กระเป๋าและรองเท้า</);
    expect(html).toContain('href="/?q=%E0%B8%81%E0%B8%A3%E0%B8%B0%E0%B9%80%E0%B8%9B%E0%B9%8B%E0%B8%B2&amp;category=1"');
    expect(html).toContain("พบ 8 รายการ");
    expect(html).toMatch(/href="\/\?q=%E0%B8%81%E0%B8%A3%E0%B8%B0%E0%B9%80%E0%B8%9B%E0%B9%8B%E0%B8%B2"[^>]*>ล้างตัวกรอง</);
  });

  test("หมวดหมู่ที่ไม่มีอยู่ บอกว่าไม่พบ พร้อมรายชื่อหมวดหมู่ให้เลือกใหม่ และไม่มีสินค้า", () => {
    const html = render({ category: "99" }, { categoryNotFound: true });

    expect(html).toContain("ไม่พบหมวดหมู่นี้");
    expect(html).toContain("เสื้อผ้าและแฟชั่น");
    expect(html).toContain("กระเป๋าและรองเท้า");
    expect(html).not.toContain("/products/");
  });
});

describe("BRW-004 กรองตามช่วงราคา", () => {
  test("ช่องราคาแสดงค่าที่กรองอยู่ และรับเฉพาะตัวเลข", () => {
    const html = render({ min: "100", max: "500" }, { items: [card(1)], total: 3, totalPages: 1 });
    expect(html).toMatch(/inputMode="numeric"[^>]*name="min" value="100"/);
    expect(html).toMatch(/inputMode="numeric"[^>]*name="max" value="500"/);
  });

  test("ช่วงราคาผิด แสดงข้อความใต้ช่องราคา และตัวกรองที่พับไว้กางออกให้เห็นข้อความ", () => {
    const html = render(
      { min: "500", max: "100" },
      { items: [card(1)], total: 3, totalPages: 1, priceError: "ราคาต่ำสุดต้องไม่มากกว่าราคาสูงสุด" },
    );
    expect(html).toContain("ราคาต่ำสุดต้องไม่มากกว่าราคาสูงสุด");
    expect(html).toMatch(/<details[^>]*open=""/);
    expect(html).not.toContain("ราคา ฿500");
  });

  test("ช่วงราคาและการเรียงพับไว้หลังปุ่ม ตัวกรอง และบรรทัดจำนวนผลลัพธ์บอกคำค้นกับตัวกรองที่ใช้อยู่", () => {
    const html = render(
      { q: "กระเป๋า", category: "2", min: "100", max: "500" },
      { items: [card(1)], total: 3, totalPages: 1, category: categories[1] },
    );
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

    expect(html).toMatch(/<details[^>]*><summary[^>]*>.*ตัวกรอง<\/summary>/);
    expect(html).not.toMatch(/<details[^>]*open=""/);
    expect(text).toContain("พบ 3 รายการ สำหรับ &quot;กระเป๋า&quot;");
    expect(text).toContain("กระเป๋าและรองเท้า ราคา ฿100 ถึง ฿500 ล้างตัวกรอง");
    expect(render({ max: "500" }, { items: [card(1)], total: 1, totalPages: 1 })).toContain("ราคาไม่เกิน ฿500");
    expect(render({ min: "250" }, { items: [card(1)], total: 1, totalPages: 1 })).toContain("ราคาตั้งแต่ ฿250");
  });
});

describe("SNT-008 ตัวกรองที่ใช้อยู่เอาออกได้ทีละอัน", () => {
  const some = { items: [card(1)], total: 3, totalPages: 1, category: categories[1] };
  const q = encodeURIComponent("กระเป๋า");

  test("แต่ละอันเป็นลิงก์ที่เอาเฉพาะตัวเองออก คงอย่างอื่นไว้ และกลับไปหน้า 1", () => {
    const html = render({ q: "กระเป๋า", category: "2", min: "100", max: "500", sort: "price-asc", page: "2" }, some);

    expect(html).toContain(`aria-label="เอา กระเป๋าและรองเท้า ออก" href="/?q=${q}&amp;min=100&amp;max=500&amp;sort=price-asc"`);
    expect(html).toContain(`aria-label="เอา ราคา ฿100 ถึง ฿500 ออก" href="/?q=${q}&amp;category=2&amp;sort=price-asc"`);
    expect(html).toContain(`aria-label="เอา เรียงราคาต่ำไปสูง ออก" href="/?q=${q}&amp;category=2&amp;min=100&amp;max=500"`);
  });

  test("การเรียงแบบใหม่ล่าสุดเป็นค่าเริ่มต้น จึงไม่ขึ้นเป็นตัวกรอง และมีแค่การเรียงก็ไม่มีล้างตัวกรอง", () => {
    expect(render({ q: "กระเป๋า" }, { ...some, category: null })).not.toContain("ตัวกรองที่ใช้อยู่");
    const sorted = render({ sort: "price-desc" }, { ...some, category: null });
    expect(sorted).toContain('aria-label="เอา เรียงราคาสูงไปต่ำ ออก"');
    expect(sorted).not.toContain("ล้างตัวกรอง");
  });

  test("ช่วงราคาที่ผิดไม่ได้ถูกใช้กรอง จึงไม่ขึ้นเป็นตัวกรอง", () => {
    const html = render({ min: "500", max: "100" }, { ...some, category: null, priceError: "ราคาต่ำสุดต้องไม่มากกว่าราคาสูงสุด" });
    expect(html).not.toContain("เอา ราคา");
  });
});

describe("BRW-005 เรียงลำดับ", () => {
  test("ช่องเลือกการเรียงแสดงแบบที่เลือกอยู่ ค่าที่ไม่รู้จักแสดงใหม่ล่าสุด", () => {
    const some = { items: [card(1)], total: 1, totalPages: 1 };
    expect(render({ sort: "price-asc" }, some)).toMatch(/<option value="price-asc" selected="">ราคาต่ำไปสูง/);
    expect(render({ sort: "oops" }, some)).toMatch(/<option value="newest" selected="">ใหม่ล่าสุด/);
  });
});

describe("BRW-006 แบ่งหน้าผลลัพธ์", () => {
  test("หน้าสุดท้ายแสดงเลขหน้า และปุ่มหน้าถัดไปกดไม่ได้ ลิงก์หน้าก่อนหน้าคงคำค้นไว้", () => {
    const html = render({ q: "แก้ว", page: "3" }, { items: [card(1)], total: 45, page: 3, totalPages: 3 });

    expect(html).toContain("หน้า 3 จาก 3");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>หน้าถัดไป</);
    expect(html).toMatch(/href="\/\?q=%E0%B9%81%E0%B8%81%E0%B9%89%E0%B8%A7&amp;page=2"[^>]*>หน้าก่อนหน้า</);
  });

  test("ผลลัพธ์ไม่เกิน 20 รายการ ไม่มีเลขหน้า", () => {
    expect(render({}, { items: [card(1)], total: 1, totalPages: 1 })).not.toContain("หน้าถัดไป");
  });
});

describe("BRW-011 หน้าว่าง", () => {
  test("ค้นหาไม่เจอ แสดงพบ 0 รายการ ข้อความ คำค้นที่ใช้ และปุ่มเดียวที่พากลับหน้าแรก โดยไม่มีเลขหน้า", () => {
    const html = render({ q: "ยานอวกาศ" }, {});

    expect(html).toContain("พบ 0 รายการ");
    expect(html).toContain("ไม่พบสินค้าที่ตรงกับที่ค้นหา");
    expect(html).toContain("ยานอวกาศ");
    expect(html).toMatch(/<a class="button" href="\/">ดูสินค้าทั้งหมด<\/a>/);
    expect(html).not.toContain("ล้างตัวกรอง");
    expect(html).not.toContain("หน้าถัดไป");
  });

  test("ค้นหาไม่เจอขณะเลือกหมวดหมู่ไว้ ปุ่มเดียวคือล้างตัวกรองที่คงคำค้นไว้", () => {
    const html = render({ q: "ยานอวกาศ", category: "1" }, { category: categories[0] });

    expect(html).toMatch(/<a class="button" href="\/\?q=[^"]+">ล้างตัวกรอง<\/a>/);
    expect(html.match(/ล้างตัวกรอง/g)).toHaveLength(1);
    expect(html).not.toContain("ดูสินค้าทั้งหมด");
  });

  test("ระบบไม่มีสินค้าเลย แสดงหมวดหมู่และข้อความว่ายังไม่มีสินค้า ไม่ใช่ข้อความผิดพลาด", () => {
    const html = render({}, {});

    expect(html).toContain("เสื้อผ้าและแฟชั่น");
    expect(html).toContain("ยังไม่มีสินค้าในตอนนี้");
    expect(html).not.toContain("โหลดข้อมูลไม่สำเร็จ");
    expect(html).not.toContain("ไม่พบสินค้าที่ตรงกับที่ค้นหา");
  });
});

describe("BRW-012 หน้ากำลังโหลด", () => {
  test("โครงสีเทา 20 ช่องแทนรายการสินค้า", () => {
    const html = renderToStaticMarkup(<ResultsSkeleton />);
    expect(html).toContain('role="status"');
    expect(html.match(/data-skeleton-card/g)).toHaveLength(20);
  });
});

describe("หน้าแรกรอบ 3: ส่วนต้อนรับและชั้นวางก่อนรายการสินค้า", () => {
  const home = {
    categories: [{ id: 1, name: "เสื้อผ้าและแฟชั่น", coverUrl: null }],
    budget: [card(1, { price: 99 }), card(30, { price: 120 })],
    shops: [{ id: 5, name: "บ้านสวนผ้าไทย", logoUrl: null, productCount: 20, covers: ["/sample-images/p1-1.svg"] }],
  };
  const full: SearchResult = { items: [card(1), card(2)], total: 2, page: 1, totalPages: 1, category: null, categoryNotFound: false, priceError: null };
  const html = renderToStaticMarkup(<BrowseResults params={parseBrowseParams({})} result={full} categories={categories} home={home} />);

  test("สโลแกนเป็นหัวเรื่องเดียวของหน้า มีช่องค้นหาของส่วนต้อนรับ การ์ดหมวด ชั้นวาง แล้วรายการพร้อมจำนวน", () => {
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html.replace(/<[^>]+>/g, "")).toContain("ซื้อของจากหลายร้านในที่เดียว");
    expect(html).toMatch(/aria-label="พิมพ์สิ่งที่อยากได้"/);
    expect(html).toContain('href="/?category=1"');
    expect(html).toContain('href="/?max=300"');
    expect(html).toContain('href="/shops/5"');
    expect(html).toContain("มาใหม่ล่าสุด");
    expect(html).toContain("พบ 2 รายการ");
    expect(html.indexOf("ร้านเด่น")).toBeLessThan(html.indexOf("พบ 2 รายการ"));
  });

  test("ปุ่มสีเขียวเต็มมีปุ่มเดียว คือปุ่มค้นหาของส่วนต้อนรับ", () => {
    expect(html.match(/class="button(?! button-secondary)[^"]*"/g)).toHaveLength(1);
  });

  test("หน้าผลการค้นหาไม่มีส่วนต้อนรับ", () => {
    const search = render({ q: "เสื้อ" }, { items: [card(1)], total: 1, totalPages: 1 });
    expect(search).not.toContain("พิมพ์สิ่งที่อยากได้");
    expect(search).not.toContain("ร้านเด่น");
  });
});
