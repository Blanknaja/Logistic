import { beforeEach, describe, expect, test } from "vitest";
import { MESSAGES } from "@/features/review/rules";
import type { Db } from "@/shared/db";
import { addAccount, addOrder, addProduct, addShop } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";
import { ORDER_STATUS, REVIEW_STATUS, SHOP_STATUS, type OrderStatus } from "@/shared/statuses";
import { writeReview } from "./fixtures";
import { getReviewImage, saveReviewImage, UNUSED_UPLOAD_KEEP_MS, UNUSED_UPLOAD_LIMIT } from "./image-files";
import { productRating, shopRating } from "./ratings";
import {
  countUnansweredReviews,
  editReview,
  getReviewTarget,
  hideReview,
  listAllReviews,
  listProductReviews,
  listShopReviews,
  replyToReview,
  submitReview,
  unhideReview,
} from "./reviews";

let db: Db;
let somying: number;
let manee: number;
let wichai: number;
let somchaiShop: number;
let manaShop: number;
let screwdriver: { id: number; variantIds: number[] };
let hammer: { id: number; variantIds: number[] };
let football: { id: number; variantIds: number[] };

const at = (text: string) => new Date(`${text}:00.000+07:00`);
const NOV26_1810 = at("2026-11-26T18:10");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

beforeEach(() => {
  db = createTestDb();
  somying = addAccount(db, { displayName: "สมหญิง", email: "somying@example.com" }).id;
  manee = addAccount(db, { displayName: "มานี", email: "manee@example.com" }).id;
  wichai = addAccount(db, { displayName: "วิชัย", isAdmin: true }).id;
  somchaiShop = addShop(db, { name: "สมชายการช่าง" }).id;
  manaShop = addShop(db, { name: "มานะสปอร์ต" }).id;
  screwdriver = addProduct(db, { shopId: somchaiShop, name: "ไขควง" });
  hammer = addProduct(db, { shopId: somchaiShop, name: "ค้อน" });
  football = addProduct(db, { shopId: manaShop, name: "ลูกฟุตบอล" });
});

/** คำสั่งซื้อหนึ่งรายการของผู้ซื้อ คืนเลขรายการในคำสั่งซื้อตามลำดับ variantIds */
function order(buyerAccountId: number, variantIds: number[], status: OrderStatus = ORDER_STATUS.completed) {
  const created = addOrder(db, { buyerAccountId, items: variantIds.map((variantId) => ({ variantId })), status });
  const itemIds = (db.prepare("SELECT id FROM order_items WHERE order_id = ? ORDER BY id").all(created.id) as { id: number }[]).map(
    (row) => row.id,
  );
  return { ...created, itemIds };
}

/** รีวิวของผู้ซื้อใหม่หนึ่งคนจากคำสั่งซื้อที่สำเร็จ ข้ามกฎการส่ง */
function reviewed(variantId: number, rating: number, input: Partial<Parameters<typeof writeReview>[1]> & { buyer?: number } = {}) {
  const buyer = input.buyer ?? addAccount(db).id;
  const { itemIds, orderNo } = order(buyer, [variantId]);
  return { ...writeReview(db, { ...input, orderItemId: itemIds[0], rating }), itemId: itemIds[0], orderNo, buyer };
}

const countReviews = () => Number(db.prepare("SELECT count(*) AS n FROM reviews").get()?.n);
const row = (id: number) => db.prepare("SELECT * FROM reviews WHERE id = ?").get(id) as Record<string, string | number | null>;
const send = (buyerAccountId: number, orderItemId: number, rating: number, body = "", images: string[] = [], now = NOV26_1810) =>
  submitReview(db, { buyerAccountId, orderItemId, rating, body, images }, now);

describe("REV-001 ผู้ซื้อเขียนรีวิว", () => {
  test("REV-001 ส่ง 4 ดาวพร้อมข้อความ รีวิวเป็น แสดงอยู่ ขึ้นบนสุดของสินค้า และคะแนนเฉลี่ยเป็น 4.3 จาก 3 รีวิว", () => {
    reviewed(screwdriver.variantIds[0], 5, { createdAt: "2026-11-20T03:00:00.000Z" });
    reviewed(screwdriver.variantIds[0], 4, { createdAt: "2026-11-21T03:00:00.000Z" });
    const mine = order(somying, [screwdriver.variantIds[0]]);

    const result = send(somying, mine.itemIds[0], 4, "  ด้ามจับถนัดมือ ส่งไว  ");

    expect(result.ok).toBe(true);
    expect(productRating(db, screwdriver.id)).toMatchObject({ average: 4.3, count: 3 });
    const top = listProductReviews(db, screwdriver.id).reviews[0];
    expect(top).toMatchObject({ author: "ส***", rating: 4, body: "ด้ามจับถนัดมือ ส่งไว", status: REVIEW_STATUS.visible, createdAt: NOV26_1810.toISOString() });
    const target = getReviewTarget(db, somying, mine.orderNo, mine.itemIds[0], NOV26_1810);
    expect(target).toMatchObject({ state: "open", review: { rating: 4, canEdit: true } });
  });

  test("REV-001 ไม่เลือกดาว หรือข้อความ 501 ตัวอักษร ได้ข้อความใต้ช่องนั้น และไม่มีรีวิวถูกบันทึก", () => {
    const mine = order(somying, [screwdriver.variantIds[0]]);
    expect(send(somying, mine.itemIds[0], 0)).toEqual({ ok: false, errors: { rating: "เลือกคะแนน 1 ถึง 5 ดาว" } });
    expect(send(somying, mine.itemIds[0], 6)).toMatchObject({ errors: { rating: MESSAGES.rating } });
    expect(send(somying, mine.itemIds[0], 4.5)).toMatchObject({ errors: { rating: MESSAGES.rating } });
    expect(send(somying, mine.itemIds[0], 4, "ก".repeat(501))).toEqual({
      ok: false,
      errors: { body: "ข้อความยาวได้ไม่เกิน 500 ตัวอักษร" },
    });
    expect(countReviews()).toBe(0);
    expect(send(somying, mine.itemIds[0], 4, ` ${"ก".repeat(500)} `).ok).toBe(true);
  });
});

describe("REV-002 รูปในรีวิว", () => {
  test("REV-002 รีวิวเก็บรูปที่ผู้ซื้อส่งขึ้นมาเองได้ไม่เกิน 3 รูป ตามลำดับ", () => {
    const urls = [1, 2, 3, 4].map(() => {
      const saved = saveReviewImage(db, somying, PNG);
      if (!saved.ok) throw new Error(saved.error);
      return saved.url;
    });
    const mine = order(somying, [screwdriver.variantIds[0], hammer.variantIds[0]]);

    expect(send(somying, mine.itemIds[0], 4, "", urls)).toEqual({ ok: false, errors: { images: "ใส่รูปได้ไม่เกิน 3 รูป" } });
    expect(send(somying, mine.itemIds[0], 4, "", urls.slice(0, 2)).ok).toBe(true);
    expect(listProductReviews(db, screwdriver.id).reviews[0].images).toEqual(urls.slice(0, 2));
  });

  test("REV-002 ไม่รับที่อยู่รูปที่บัญชีนี้ไม่ได้ส่งขึ้นมา", () => {
    const other = saveReviewImage(db, manee, PNG);
    const mine = order(somying, [screwdriver.variantIds[0]]);
    for (const url of [other.ok ? other.url : "", "https://example.com/x.png", "/product-images/abc"]) {
      expect(send(somying, mine.itemIds[0], 4, "", [url])).toEqual({ ok: false, errors: { images: MESSAGES.uploadFailed } });
    }
    expect(countReviews()).toBe(0);
  });

  test("REV-002 เก็บเฉพาะ JPG หรือ PNG ที่ไม่เกิน 5 MB ดูจากไบต์ต้นไฟล์", () => {
    const gif = new TextEncoder().encode("GIF89a....");
    expect(saveReviewImage(db, somying, gif)).toEqual({ ok: false, error: "ใช้ได้เฉพาะรูป JPG หรือ PNG" });
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(PNG);
    expect(saveReviewImage(db, somying, big)).toEqual({ ok: false, error: "รูปต้องมีขนาดไม่เกิน 5 MB" });
    expect(saveReviewImage(db, somying, PNG).ok).toBe(true);
  });

  test("REV-002 บัญชีหนึ่งมีรูปที่ยังไม่มีรีวิวใช้ได้จำกัด เกินแล้วไม่รับจนกว่ารูปจะถูกใช้หรือครบ 24 ชั่วโมง", () => {
    const urls = Array.from({ length: UNUSED_UPLOAD_LIMIT }, () => {
      const saved = saveReviewImage(db, somying, PNG, NOV26_1810);
      if (!saved.ok) throw new Error(saved.error);
      return saved.url;
    });
    expect(saveReviewImage(db, somying, PNG, NOV26_1810)).toEqual({ ok: false, error: MESSAGES.tooManyUnusedUploads });
    expect(saveReviewImage(db, manee, PNG, NOV26_1810).ok).toBe(true);

    const mine = order(somying, [screwdriver.variantIds[0]]);
    expect(send(somying, mine.itemIds[0], 4, "", urls.slice(0, 1)).ok).toBe(true);
    expect(saveReviewImage(db, somying, PNG, NOV26_1810).ok).toBe(true);
    expect(saveReviewImage(db, somying, PNG, NOV26_1810).ok).toBe(false);

    const nextDay = new Date(NOV26_1810.getTime() + UNUSED_UPLOAD_KEEP_MS + 1);
    expect(saveReviewImage(db, somying, PNG, nextDay).ok).toBe(true);
    expect(Number(db.prepare("SELECT count(*) AS n FROM review_image_files WHERE account_id = ?").get(somying)?.n)).toBe(2);
  });

  test("REV-017 รูปของรีวิวที่ถูกซ่อนเปิดได้เฉพาะผู้ซื้อเจ้าของรีวิว ร้านของรีวิวนั้น และผู้ดูแลแพลตฟอร์ม", () => {
    const saved = saveReviewImage(db, manee, PNG);
    if (!saved.ok) throw new Error(saved.error);
    const key = saved.url.split("/").pop() ?? "";
    const viewer = (id: number, shopId: number | null = null, isAdmin = false) => ({ id, shopId, isAdmin });

    expect(getReviewImage(db, key, null)).toBeNull();
    expect(getReviewImage(db, key, viewer(somying))).toBeNull();
    expect(getReviewImage(db, key, viewer(manee))?.contentType).toBe("image/png");

    const mine = order(manee, [football.variantIds[0]]);
    const sent = send(manee, mine.itemIds[0], 1, "", [saved.url]);
    if (!sent.ok) throw new Error("ส่งรีวิวไม่ผ่าน");
    expect(getReviewImage(db, key, null)?.contentType).toBe("image/png");

    hideReview(db, { adminAccountId: wichai, reviewId: sent.reviewId, reason: "ใช้คำหยาบ" });
    expect(getReviewImage(db, key, null)).toBeNull();
    expect(getReviewImage(db, key, viewer(somying))).toBeNull();
    expect(getReviewImage(db, key, viewer(somying, somchaiShop))).toBeNull();
    expect(getReviewImage(db, key, viewer(manee))).not.toBeNull();
    expect(getReviewImage(db, key, viewer(somying, manaShop))).not.toBeNull();
    expect(getReviewImage(db, key, viewer(wichai, null, true))).not.toBeNull();

    unhideReview(db, { adminAccountId: wichai, reviewId: sent.reviewId });
    expect(getReviewImage(db, key, null)).not.toBeNull();
  });
});

describe("REV-003 หนึ่งรายการในคำสั่งซื้อมีได้หนึ่งรีวิว", () => {
  test("REV-003 คำสั่งซื้อ 2 รายการ รีวิวได้ 2 รีวิวแยกกัน และซื้อสินค้าเดิมอีกคำสั่งซื้อก็รีวิวได้อีก", () => {
    const mine = order(somying, [screwdriver.variantIds[0], hammer.variantIds[0]]);
    expect(send(somying, mine.itemIds[0], 4).ok).toBe(true);
    expect(send(somying, mine.itemIds[1], 5).ok).toBe(true);
    const again = order(somying, [screwdriver.variantIds[0]]);
    expect(send(somying, again.itemIds[0], 3).ok).toBe(true);

    expect(productRating(db, screwdriver.id)?.count).toBe(2);
    expect(productRating(db, hammer.id)).toMatchObject({ average: 5, count: 1 });
  });

  test("REV-003 ส่งซ้ำ คำสั่งซื้อยังไม่สำเร็จ หรือคำสั่งซื้อของบัญชีอื่น ไม่บันทึกรีวิวใหม่และรีวิวเดิมไม่เปลี่ยน", () => {
    const mine = order(somying, [screwdriver.variantIds[0]]);
    const shipping = order(somying, [hammer.variantIds[0]], ORDER_STATUS.shipping);
    const hers = order(manee, [hammer.variantIds[0]]);

    expect(send(somying, mine.itemIds[0], 4, "ครั้งแรก").ok).toBe(true);
    expect(send(somying, mine.itemIds[0], 4, "ครั้งแรก")).toEqual({ ok: false, errors: { form: "รายการนี้รีวิวไปแล้ว" } });
    expect(send(somying, mine.itemIds[0], 1, "หน้าต่างที่สอง", [], at("2026-11-26T18:11"))).toEqual({
      ok: false,
      errors: { form: "รายการนี้รีวิวไปแล้ว" },
    });
    expect(send(somying, shipping.itemIds[0], 5)).toEqual({ ok: false, errors: { form: "รีวิวได้หลังคำสั่งซื้อสำเร็จ" } });
    expect(send(somying, hers.itemIds[0], 5)).toEqual({ ok: false, errors: { form: "ไม่พบคำสั่งซื้อ" } });
    expect(send(somying, 999_999, 5)).toEqual({ ok: false, errors: { form: "ไม่พบคำสั่งซื้อ" } });

    expect(countReviews()).toBe(1);
    expect(listProductReviews(db, screwdriver.id).reviews[0]).toMatchObject({ rating: 4, body: "ครั้งแรก" });
  });

  test("REV-003 หน้าเขียนรีวิวของคำสั่งซื้อที่ยังไม่สำเร็จบอกว่ายังรีวิวไม่ได้ และของบัญชีอื่นไม่ให้ข้อมูลใด", () => {
    const shipping = order(somying, [hammer.variantIds[0]], ORDER_STATUS.shipping);
    const hers = order(manee, [hammer.variantIds[0]]);
    expect(getReviewTarget(db, somying, shipping.orderNo, shipping.itemIds[0])).toEqual({ state: "notCompleted" });
    expect(getReviewTarget(db, somying, hers.orderNo, hers.itemIds[0])).toEqual({ state: "notFound" });
    expect(getReviewTarget(db, somying, shipping.orderNo, hers.itemIds[0])).toEqual({ state: "notFound" });
  });
});

describe("REV-004 แก้รีวิวภายใน 7 วัน", () => {
  test("REV-004 แก้คะแนนและข้อความวันที่ 28 พ.ย. ได้คำว่าแก้ไขแล้ว คงวันที่ส่งครั้งแรกและคำตอบของร้าน เฉลี่ยเป็น 3.7", () => {
    reviewed(screwdriver.variantIds[0], 5);
    reviewed(screwdriver.variantIds[0], 4);
    const mine = order(somying, [screwdriver.variantIds[0]]);
    const sent = send(somying, mine.itemIds[0], 4, "ด้ามจับถนัดมือ ส่งไว");
    if (!sent.ok) throw new Error("ส่งรีวิวไม่ได้");
    expect(replyToReview(db, { shopId: somchaiShop, reviewId: sent.reviewId, body: "ขอบคุณครับ", editing: false }, at("2026-11-26T19:10")).ok).toBe(true);

    const edited = editReview(
      db,
      { buyerAccountId: somying, orderItemId: mine.itemIds[0], rating: 2, body: "ใช้ 2 วันหัวไขควงบิ่น", images: [] },
      at("2026-11-28T09:00"),
    );

    expect(edited.ok).toBe(true);
    const shown = listProductReviews(db, screwdriver.id).reviews.find((review) => review.id === sent.reviewId);
    expect(shown).toMatchObject({
      rating: 2,
      body: "ใช้ 2 วันหัวไขควงบิ่น",
      edited: true,
      createdAt: NOV26_1810.toISOString(),
      reply: { body: "ขอบคุณครับ" },
    });
    expect(productRating(db, screwdriver.id)).toMatchObject({ average: 3.7, count: 3 });
    expect(getReviewTarget(db, somying, mine.orderNo, mine.itemIds[0], at("2026-11-28T09:01"))).toMatchObject({
      review: { canEdit: true, editableUntil: at("2026-12-03T18:10").toISOString() },
    });
  });

  test("REV-004 กดบันทึกหลังครบ 7 วัน ได้ข้อความว่าแก้ได้ภายใน 7 วัน รีวิวเดิมไม่เปลี่ยน และไม่มีปุ่มแก้ไขอีก", () => {
    const mine = order(somying, [screwdriver.variantIds[0]]);
    send(somying, mine.itemIds[0], 4, "เดิม");
    const input = { buyerAccountId: somying, orderItemId: mine.itemIds[0], rating: 1, body: "ใหม่", images: [] };

    expect(editReview(db, input, at("2026-12-03T18:09")).ok).toBe(true);
    expect(editReview(db, { ...input, body: "เดิม", rating: 4 }, at("2026-12-03T18:09")).ok).toBe(true);
    expect(editReview(db, input, at("2026-12-03T18:10"))).toEqual({ ok: false, errors: { form: "แก้รีวิวได้ภายใน 7 วันหลังส่ง" } });
    expect(editReview(db, input, at("2026-12-03T18:11"))).toEqual({ ok: false, errors: { form: "แก้รีวิวได้ภายใน 7 วันหลังส่ง" } });

    expect(listProductReviews(db, screwdriver.id).reviews[0]).toMatchObject({ rating: 4, body: "เดิม" });
    expect(getReviewTarget(db, somying, mine.orderNo, mine.itemIds[0], at("2026-12-03T18:11"))).toMatchObject({ review: { canEdit: false } });
  });

  test("REV-004 แก้รูปได้ เอารูปเดิมออกและเพิ่มรูปใหม่ และบัญชีอื่นแก้รีวิวนี้ไม่ได้", () => {
    const [first, second] = [1, 2].map(() => {
      const saved = saveReviewImage(db, somying, PNG);
      return saved.ok ? saved.url : "";
    });
    const mine = order(somying, [screwdriver.variantIds[0]]);
    send(somying, mine.itemIds[0], 4, "", [first]);
    const input = { buyerAccountId: somying, orderItemId: mine.itemIds[0], rating: 4, body: "", images: [second] };

    expect(editReview(db, { ...input, buyerAccountId: manee }, at("2026-11-27T09:00"))).toEqual({ ok: false, errors: { form: "ไม่พบคำสั่งซื้อ" } });
    expect(editReview(db, input, at("2026-11-27T09:00")).ok).toBe(true);
    expect(listProductReviews(db, screwdriver.id).reviews[0].images).toEqual([second]);
  });
});

describe("REV-006 สรุปคะแนนของสินค้า", () => {
  test("REV-006 5 ดาว 1 รีวิว กับ 4 ดาว 3 รีวิว ได้ 4.3 จาก 4 รีวิว และจำนวนของแต่ละดาว รวมทุกแบบย่อย", () => {
    const shoes = addProduct(db, { shopId: manaShop, options: [{ name: "สี", values: ["ดำ", "ขาว"] }] });
    reviewed(shoes.variantIds[0], 5);
    reviewed(shoes.variantIds[1], 4);
    reviewed(shoes.variantIds[1], 4);
    reviewed(shoes.variantIds[0], 4);

    expect(productRating(db, shoes.id)).toEqual({ average: 4.3, count: 4, stars: { 5: 1, 4: 3, 3: 0, 2: 0, 1: 0 } });
  });

  test("REV-006 4.24 ปัดเป็น 4.2", () => {
    for (const rating of [...Array(6).fill(5), ...Array(19).fill(4)]) reviewed(football.variantIds[0], rating);
    expect(productRating(db, football.id)?.average).toBe(4.2);
  });

  test("REV-006 ยังไม่มีรีวิว หรือมีแต่รีวิวที่ถูกซ่อน ไม่มีคะแนนเฉลี่ย", () => {
    expect(productRating(db, football.id)).toBeNull();
    reviewed(football.variantIds[0], 5, { hidden: { reason: "ใช้คำหยาบ" } });
    expect(productRating(db, football.id)).toBeNull();
    expect(listProductReviews(db, football.id)).toMatchObject({ reviews: [], total: 0 });
  });
});

describe("REV-007 รายการรีวิวของสินค้า", () => {
  const twentyThree = () => {
    const shoes = addProduct(db, { shopId: manaShop, name: "รองเท้าวิ่ง", options: [{ name: "สี", values: ["สีดำ ขนาด 42"] }] });
    const ratings = [...Array(11).fill(5), ...Array(6).fill(4), ...Array(3).fill(3), ...Array(2).fill(1)];
    const ids = ratings.map(
      (rating, i) => reviewed(shoes.variantIds[0], rating, { createdAt: new Date(Date.UTC(2026, 10, 1 + i)).toISOString() }).id,
    );
    const latest = reviewed(shoes.variantIds[0], 5, {
      buyer: somying,
      createdAt: at("2026-11-26T09:00").toISOString(),
      images: ["/review-images/a"],
      reply: { body: "ขอบคุณครับ", at: at("2026-11-26T09:30").toISOString() },
    });
    return { shoes, ids, latest };
  };

  test("REV-007 เรียงจากล่าสุด หน้าละ 10 รีวิว แต่ละรีวิวมีชื่อที่ปิด คะแนน วันที่ แบบย่อย รูป และคำตอบของร้าน", () => {
    const { shoes } = twentyThree();
    const first = listProductReviews(db, shoes.id);
    expect(first).toMatchObject({ total: 23, page: 1, totalPages: 3 });
    expect(first.reviews).toHaveLength(10);
    expect(first.reviews[0]).toMatchObject({
      author: "ส***",
      rating: 5,
      createdAt: at("2026-11-26T09:00").toISOString(),
      variantLabel: "สีดำ ขนาด 42",
      images: ["/review-images/a"],
      reply: { body: "ขอบคุณครับ", repliedAt: at("2026-11-26T09:30").toISOString(), edited: false },
      orderNo: null,
    });
    const third = listProductReviews(db, shoes.id, { page: 3 });
    expect(third).toMatchObject({ page: 3, totalPages: 3 });
    expect(third.reviews).toHaveLength(3);
  });

  test("REV-007 หน้าที่ขอไม่มีแล้วเพราะรีวิวถูกซ่อน ได้หน้าสุดท้ายที่มีอยู่จริง และไม่มีรีวิวที่ถูกซ่อน", () => {
    const { shoes, ids } = twentyThree();
    for (const id of ids.slice(0, 3)) hideReview(db, { adminAccountId: wichai, reviewId: id, reason: "ไม่เหมาะสม" });

    const page = listProductReviews(db, shoes.id, { page: 3 });
    expect(page).toMatchObject({ total: 20, page: 2, totalPages: 2 });
    expect(page.reviews).toHaveLength(10);
    const shown = [...listProductReviews(db, shoes.id).reviews, ...page.reviews].map((review) => review.id);
    expect(shown.some((id) => ids.slice(0, 3).includes(id))).toBe(false);
  });

  test("REV-Q05 รายการรีวิวของสินค้าและของร้านไม่มีชื่อที่แสดงเต็มหรืออีเมลของผู้เขียน", () => {
    const { shoes } = twentyThree();
    const seen = JSON.stringify([listProductReviews(db, shoes.id), listShopReviews(db, manaShop)]);
    expect(seen).not.toContain("สมหญิง");
    expect(seen).not.toContain("somying@example.com");
    expect(JSON.stringify(listAllReviews(db))).toContain("สมหญิง");
  });
});

describe("REV-008 กรองรีวิวตามจำนวนดาว", () => {
  test("REV-008 เลือก 1 ดาว เห็นเฉพาะรีวิว 1 ดาว ที่หน้า 1 และเลือก 2 ดาวที่ไม่มีรีวิวได้รายการว่าง", () => {
    for (const rating of [...Array(12).fill(5), ...Array(6).fill(4), ...Array(3).fill(3), 1, 1]) reviewed(football.variantIds[0], rating);

    const one = listProductReviews(db, football.id, { stars: 1, page: 2 });
    expect(one).toMatchObject({ total: 2, page: 1, totalPages: 1 });
    expect(one.reviews.map((review) => review.rating)).toEqual([1, 1]);
    expect(listProductReviews(db, football.id, { stars: 2 })).toMatchObject({ reviews: [], total: 0 });
    expect(productRating(db, football.id)).toMatchObject({ count: 23, stars: { 5: 12, 4: 6, 3: 3, 2: 0, 1: 2 } });
  });
});

describe("REV-013 คะแนนของร้าน", () => {
  test("REV-013 คิดจากรีวิวทีละรีวิวของสินค้าทุกชิ้น: 5 4 4 4 กับ 1 ได้ 3.6 จาก 5 รีวิว แม้สินค้าถูกลบแล้ว", () => {
    const shoes = addProduct(db, { shopId: manaShop, name: "รองเท้าวิ่ง" });
    for (const rating of [5, 4, 4, 4]) reviewed(football.variantIds[0], rating);
    reviewed(shoes.variantIds[0], 1);
    db.prepare("UPDATE products SET status = 'ลบแล้ว' WHERE id = ?").run(shoes.id);

    expect(shopRating(db, manaShop)).toMatchObject({ average: 3.6, count: 5 });
  });

  test("REV-013 ร้านที่ยังไม่มีรีวิวที่แสดงอยู่ไม่มีคะแนน", () => {
    reviewed(football.variantIds[0], 5);
    expect(shopRating(db, somchaiShop)).toBeNull();
  });
});

describe("REV-014 หน้ารีวิวของร้าน", () => {
  test("REV-014 เห็นเฉพาะรีวิวของร้านตัวเอง ล่าสุดก่อน หน้าละ 20 พร้อมจำนวนทั้งหมดและที่ยังไม่ตอบ", () => {
    for (let i = 0; i < 42; i++) {
      reviewed(hammer.variantIds[0], 5, { createdAt: new Date(Date.UTC(2026, 9, 1 + i)).toISOString(), reply: { body: "ขอบคุณครับ" } });
    }
    reviewed(hammer.variantIds[0], 3, { createdAt: "2026-11-20T00:00:00.000Z" });
    reviewed(hammer.variantIds[0], 2, { createdAt: "2026-11-21T00:00:00.000Z" });
    const latest = reviewed(screwdriver.variantIds[0], 4, { buyer: somying, createdAt: NOV26_1810.toISOString() });
    reviewed(football.variantIds[0], 1);

    const all = listShopReviews(db, somchaiShop);
    expect(all).toMatchObject({ counts: { all: 45, unanswered: 3 }, page: 1, totalPages: 3 });
    expect(all.reviews).toHaveLength(20);
    const unanswered = listShopReviews(db, somchaiShop, { unanswered: true });
    expect(unanswered.reviews).toHaveLength(3);
    expect(unanswered.reviews[0]).toMatchObject({ productName: "ไขควง", author: "ส***", rating: 4, orderNo: latest.orderNo, reply: null });
    expect(countUnansweredReviews(db, somchaiShop)).toBe(3);
    expect(listShopReviews(db, manaShop).counts).toEqual({ all: 1, unanswered: 1 });
  });

  test("REV-014 รีวิวที่ถูกซ่อนไม่นับเป็นยังไม่ตอบ แต่ร้านยังเห็นพร้อมเหตุผล", () => {
    reviewed(hammer.variantIds[0], 1, { hidden: { reason: "ใช้คำหยาบ" } });
    const page = listShopReviews(db, somchaiShop);
    expect(page.counts).toEqual({ all: 1, unanswered: 0 });
    expect(page.reviews[0]).toMatchObject({ status: REVIEW_STATUS.hidden, hiddenReason: "ใช้คำหยาบ" });
    expect(listShopReviews(db, somchaiShop, { unanswered: true }).reviews).toEqual([]);
  });
});

describe("REV-015 ร้านตอบรีวิว", () => {
  test("REV-015 ตอบแล้วจำนวนยังไม่ตอบลดลง คำตอบขึ้นใต้รีวิว แก้คำตอบได้โดยมีคำว่าแก้ไขแล้ว และยังมีคำตอบเดียว", () => {
    const target = reviewed(screwdriver.variantIds[0], 4, { buyer: somying });
    reviewed(hammer.variantIds[0], 5);
    reviewed(hammer.variantIds[0], 5);

    expect(replyToReview(db, { shopId: somchaiShop, reviewId: target.id, body: " ขอบคุณที่อุดหนุนครับ ", editing: false }, at("2026-11-26T19:10"))).toEqual({ ok: true });
    expect(countUnansweredReviews(db, somchaiShop)).toBe(2);
    expect(listProductReviews(db, screwdriver.id).reviews[0].reply).toEqual({
      body: "ขอบคุณที่อุดหนุนครับ",
      repliedAt: at("2026-11-26T19:10").toISOString(),
      edited: false,
    });

    const body = "ขอบคุณที่อุดหนุนครับ มีปัญหาแจ้งร้านได้เลย";
    expect(replyToReview(db, { shopId: somchaiShop, reviewId: target.id, body, editing: true }, at("2026-11-26T19:15"))).toEqual({ ok: true });
    expect(listProductReviews(db, screwdriver.id).reviews[0].reply).toEqual({ body, repliedAt: at("2026-11-26T19:10").toISOString(), edited: true });
  });

  test("REV-015 คำตอบว่าง ตอบซ้ำจากหน้าต่างที่สอง และร้านอื่นตอบ ไม่เปลี่ยนคำตอบเดิม", () => {
    const target = reviewed(hammer.variantIds[0], 4, { buyer: somying });
    const reply = (shopId: number, body: string) => replyToReview(db, { shopId, reviewId: target.id, body, editing: false });

    expect(reply(somchaiShop, "   ")).toEqual({ ok: false, error: "กรอกคำตอบ 1 ถึง 500 ตัวอักษร" });
    expect(reply(somchaiShop, "ก".repeat(501))).toEqual({ ok: false, error: "กรอกคำตอบ 1 ถึง 500 ตัวอักษร" });
    expect(reply(somchaiShop, "ขอบคุณครับ")).toEqual({ ok: true });
    expect(reply(somchaiShop, "ยินดีครับ")).toEqual({ ok: false, error: "รีวิวนี้มีคำตอบของร้านแล้ว" });
    expect(reply(manaShop, "ตอบแทน")).toEqual({ ok: false, notFound: true });
    expect(row(target.id).reply_body).toBe("ขอบคุณครับ");
  });

  test("REV-015 ร้านที่ถูกระงับยังตอบได้", () => {
    const target = reviewed(hammer.variantIds[0], 4);
    db.prepare("UPDATE shops SET status = ? WHERE id = ?").run(SHOP_STATUS.suspended, somchaiShop);
    expect(replyToReview(db, { shopId: somchaiShop, reviewId: target.id, body: "ขอบคุณครับ", editing: false })).toEqual({ ok: true });
  });
});

describe("REV-016 ผู้ดูแลแพลตฟอร์มซ่อนและเลิกซ่อนรีวิว", () => {
  test("REV-016 ซ่อนพร้อมเหตุผล รีวิวหายจากสินค้าและจำนวนถูกซ่อนเพิ่ม เลิกซ่อนแล้วกลับมา", () => {
    const target = reviewed(football.variantIds[0], 1, { buyer: manee, body: "คำหยาบ" });
    reviewed(football.variantIds[0], 5, { hidden: { reason: "เก่า" } });

    expect(hideReview(db, { adminAccountId: wichai, reviewId: target.id, reason: " ใช้คำหยาบ " }, at("2026-11-26T20:00"))).toEqual({ ok: true });
    expect(row(target.id)).toMatchObject({
      status: "ถูกซ่อน",
      hidden_reason: "ใช้คำหยาบ",
      hidden_at: at("2026-11-26T20:00").toISOString(),
      hidden_by_account_id: wichai,
    });
    const hidden = listAllReviews(db, { status: REVIEW_STATUS.hidden });
    expect(hidden.counts).toEqual({ all: 2, visible: 0, hidden: 2 });
    expect(hidden.reviews.find((review) => review.id === target.id)).toMatchObject({ author: "มานี", shopName: "มานะสปอร์ต", hiddenReason: "ใช้คำหยาบ" });
    expect(listProductReviews(db, football.id).reviews).toEqual([]);

    expect(unhideReview(db, { adminAccountId: wichai, reviewId: target.id })).toEqual({ ok: true });
    expect(listAllReviews(db).counts).toEqual({ all: 2, visible: 1, hidden: 1 });
    expect(listProductReviews(db, football.id).reviews.map((review) => review.id)).toEqual([target.id]);
  });

  test("REV-016 เหตุผลว่าง ซ่อนซ้ำ และบัญชีที่ไม่ใช่ผู้ดูแลแพลตฟอร์ม ไม่เปลี่ยนรีวิว", () => {
    const target = reviewed(football.variantIds[0], 1);
    const hide = (adminAccountId: number, reason: string, time: string) =>
      hideReview(db, { adminAccountId, reviewId: target.id, reason }, at(time));

    expect(hide(wichai, "  ", "2026-11-26T20:05")).toEqual({ ok: false, error: "กรอกเหตุผล 1 ถึง 200 ตัวอักษร" });
    expect(hide(wichai, "ก".repeat(201), "2026-11-26T20:05")).toEqual({ ok: false, error: "กรอกเหตุผล 1 ถึง 200 ตัวอักษร" });
    expect(row(target.id).status).toBe("แสดงอยู่");
    expect(hide(somying, "แกล้ง", "2026-11-26T20:07")).toEqual({ ok: false, notFound: true });
    expect(unhideReview(db, { adminAccountId: somying, reviewId: target.id })).toEqual({ ok: false, notFound: true });

    expect(hide(wichai, "ใช้คำหยาบ", "2026-11-26T20:00")).toEqual({ ok: true });
    const other = addAccount(db, { isAdmin: true }).id;
    expect(hide(other, "ซ้ำ", "2026-11-26T20:06")).toEqual({ ok: false, error: "รีวิวนี้ถูกซ่อนแล้ว" });
    expect(row(target.id)).toMatchObject({ hidden_reason: "ใช้คำหยาบ", hidden_at: at("2026-11-26T20:00").toISOString(), hidden_by_account_id: wichai });
  });
});

describe("REV-017 รีวิวที่ถูกซ่อน", () => {
  test("REV-017 ไม่นับในคะแนนของสินค้าและของร้าน ผู้ซื้อเจ้าของและร้านยังเห็นพร้อมเหตุผล และรายการนั้นยังนับว่ารีวิวแล้ว", () => {
    for (const rating of [5, 4, 4]) reviewed(football.variantIds[0], rating);
    const hers = order(manee, [football.variantIds[0]]);
    const sent = send(manee, hers.itemIds[0], 1, "คำหยาบ");
    if (!sent.ok) throw new Error("ส่งรีวิวไม่ได้");
    expect(productRating(db, football.id)).toMatchObject({ average: 3.5, count: 4 });
    expect(shopRating(db, manaShop)).toMatchObject({ average: 3.5, count: 4 });

    hideReview(db, { adminAccountId: wichai, reviewId: sent.reviewId, reason: "ใช้คำหยาบ" }, at("2026-11-26T20:00"));

    expect(productRating(db, football.id)).toEqual({ average: 4.3, count: 3, stars: { 5: 1, 4: 2, 3: 0, 2: 0, 1: 0 } });
    expect(shopRating(db, manaShop)).toMatchObject({ average: 4.3, count: 3 });
    expect(getReviewTarget(db, manee, hers.orderNo, hers.itemIds[0], at("2026-11-26T20:03"))).toMatchObject({
      state: "open",
      review: { status: "ถูกซ่อน", hiddenReason: "ใช้คำหยาบ", canEdit: false },
    });
    expect(listShopReviews(db, manaShop).reviews.find((review) => review.id === sent.reviewId)).toMatchObject({
      status: "ถูกซ่อน",
      hiddenReason: "ใช้คำหยาบ",
    });
    expect(send(manee, hers.itemIds[0], 5)).toEqual({ ok: false, errors: { form: MESSAGES.alreadyReviewed } });
  });

  test("REV-017 แก้หรือตอบรีวิวที่ถูกซ่อนไม่ได้ และคำตอบเดิมกลับมาเมื่อเลิกซ่อน", () => {
    for (const rating of [5, 4, 4]) reviewed(football.variantIds[0], rating);
    const hers = order(manee, [football.variantIds[0]]);
    const sent = send(manee, hers.itemIds[0], 1);
    if (!sent.ok) throw new Error("ส่งรีวิวไม่ได้");
    const replied = reviewed(football.variantIds[0], 4, { reply: { body: "ขอบคุณครับ" } });
    hideReview(db, { adminAccountId: wichai, reviewId: sent.reviewId, reason: "ใช้คำหยาบ" }, at("2026-11-26T20:00"));
    hideReview(db, { adminAccountId: wichai, reviewId: replied.id, reason: "ผิดสินค้า" }, at("2026-11-26T20:00"));

    const message = "รีวิวนี้ถูกซ่อนโดยผู้ดูแลแพลตฟอร์ม แก้หรือตอบไม่ได้";
    expect(
      editReview(db, { buyerAccountId: manee, orderItemId: hers.itemIds[0], rating: 5, body: "แก้", images: [] }, at("2026-11-26T20:01")),
    ).toEqual({ ok: false, errors: { form: message } });
    expect(replyToReview(db, { shopId: manaShop, reviewId: sent.reviewId, body: "ขอโทษครับ", editing: false }, at("2026-11-26T20:02"))).toEqual({
      ok: false,
      error: message,
    });
    expect(row(sent.reviewId)).toMatchObject({ rating: 1, body: "", reply_body: null });
    expect(productRating(db, football.id)?.average).toBe(4.3);

    unhideReview(db, { adminAccountId: wichai, reviewId: replied.id });
    expect(listProductReviews(db, football.id).reviews.find((review) => review.id === replied.id)?.reply?.body).toBe("ขอบคุณครับ");
  });
});

describe("REV-Q02 ความถูกต้องของคะแนนเฉลี่ย", () => {
  test("REV-Q02 คะแนนของสินค้าและของร้านตรงกับค่าที่คิดด้วยมือ หลังส่งรีวิวใหม่ แก้คะแนน ซ่อน และเลิกซ่อน", () => {
    const check = () => {
      for (const [column, id, rating] of [
        ["product_id", football.id, productRating(db, football.id)],
        ["shop_id", manaShop, shopRating(db, manaShop)],
      ] as const) {
        const ratings = (
          db.prepare(`SELECT rating FROM reviews WHERE ${column} = ? AND status = 'แสดงอยู่'`).all(id) as { rating: number }[]
        ).map((review) => review.rating);
        const sum = ratings.reduce((total, value) => total + value, 0);
        expect(rating?.count).toBe(ratings.length);
        expect(rating?.average).toBe(Math.round((sum * 10) / ratings.length) / 10);
        for (const stars of [1, 2, 3, 4, 5] as const) expect(rating?.stars[stars]).toBe(ratings.filter((value) => value === stars).length);
      }
    };
    for (const rating of [5, 4, 4]) reviewed(football.variantIds[0], rating);
    check();

    const mine = order(somying, [football.variantIds[0]]);
    const sent = send(somying, mine.itemIds[0], 4);
    if (!sent.ok) throw new Error("ส่งรีวิวไม่ได้");
    check();
    expect(productRating(db, football.id)?.average).toBe(4.3);

    editReview(db, { buyerAccountId: somying, orderItemId: mine.itemIds[0], rating: 1, body: "", images: [] }, at("2026-11-27T09:00"));
    check();
    hideReview(db, { adminAccountId: wichai, reviewId: sent.reviewId, reason: "ลอง" });
    check();
    unhideReview(db, { adminAccountId: wichai, reviewId: sent.reviewId });
    check();
  });
});
