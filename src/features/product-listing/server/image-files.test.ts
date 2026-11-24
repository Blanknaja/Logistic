import { beforeEach, describe, expect, test } from "vitest";
import type { Db } from "@/shared/db";
import { addShop } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";
import { getImageFile, isShopUpload, saveImageFile } from "./image-files";

let db: Db;
beforeEach(() => {
  db = createTestDb();
});

const MB = 1024 * 1024;

/** ไฟล์ที่ขึ้นต้นเหมือนรูปจริง ขนาดตามที่ต้องการ */
function fakeJpg(bytes = 100): Uint8Array {
  const data = new Uint8Array(bytes);
  data.set([0xff, 0xd8, 0xff, 0xe0]);
  return data;
}

function fakePng(bytes = 100): Uint8Array {
  const data = new Uint8Array(bytes);
  data.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return data;
}

describe("PRD-003 รับรูปสินค้า", () => {
  test("PRD-003 รูป JPG 2 MB และ PNG 1 MB ถูกรับ และเปิดดูได้ที่อยู่ของรูป", () => {
    const shop = addShop(db);
    const jpg = saveImageFile(db, shop.id, fakeJpg(2 * MB));
    const png = saveImageFile(db, shop.id, fakePng(MB));

    expect(jpg.ok && png.ok).toBe(true);
    if (!jpg.ok || !png.ok) return;
    expect(jpg.url).toMatch(/^\/product-images\/[\w-]+$/);
    expect(jpg.url).not.toBe(png.url);
    const file = getImageFile(db, jpg.url.split("/").pop()!);
    expect(file?.contentType).toBe("image/jpeg");
    expect(file?.data.byteLength).toBe(2 * MB);
    expect(getImageFile(db, png.url.split("/").pop()!)?.contentType).toBe("image/png");
  });

  test("PRD-003 รูป 5 MB พอดีถูกรับ", () => {
    expect(saveImageFile(db, addShop(db).id, fakeJpg(5 * MB)).ok).toBe(true);
  });

  test("PRD-003 รูป JPG 7 MB ไม่ถูกรับ เห็นข้อความ รูปต้องมีขนาดไม่เกิน 5 MB", () => {
    expect(saveImageFile(db, addShop(db).id, fakeJpg(7 * MB))).toEqual({ ok: false, error: "รูปต้องมีขนาดไม่เกิน 5 MB" });
    expect(Number(db.prepare("SELECT count(*) AS n FROM product_image_files").get()?.n)).toBe(0);
  });

  test("PRD-003 ไฟล์ที่ไม่ใช่ JPG หรือ PNG ไม่ถูกรับ แม้ตั้งชื่อเป็นรูป", () => {
    const gif = new TextEncoder().encode("GIF89a...");
    expect(saveImageFile(db, addShop(db).id, gif)).toEqual({ ok: false, error: "รูปต้องเป็นไฟล์ JPG หรือ PNG" });
  });

  test("PRD-003 ที่อยู่รูปที่ไม่มีอยู่ เปิดไม่เจอ", () => {
    expect(getImageFile(db, "no-such-key")).toBeNull();
  });
});

describe("PRD-012 รูปเป็นของร้านที่ส่งขึ้นมาเท่านั้น", () => {
  test("PRD-012 ร้านที่ส่งรูปใช้รูปนั้นได้", () => {
    const shop = addShop(db);
    const saved = saveImageFile(db, shop.id, fakeJpg());
    expect(saved.ok && isShopUpload(db, shop.id, saved.url)).toBe(true);
  });

  test("PRD-012 ร้านอื่นใช้รูปที่ร้านนี้ส่งขึ้นมาไม่ได้ และที่อยู่รูปที่ไม่ใช่ของระบบใช้ไม่ได้", () => {
    const owner = addShop(db);
    const other = addShop(db);
    const saved = saveImageFile(db, owner.id, fakeJpg());
    expect(saved.ok && isShopUpload(db, other.id, saved.url)).toBe(false);
    expect(isShopUpload(db, owner.id, "https://example.com/a.jpg")).toBe(false);
  });
});
