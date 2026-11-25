import { beforeEach, describe, expect, test } from "vitest";
import type { Db } from "@/shared/db";
import { addProduct, addShop } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";
import { PRODUCT_STATUS, type ProductStatus } from "@/shared/statuses";
import { UNUSED_IMAGE_KEEP_MS } from "./image-files";
import { getModelFile, isShopModelUpload, modelFileInfo, saveModelFile } from "./model-files";
import { fakeGlb } from "./testing";

let db: Db;
beforeEach(() => {
  db = createTestDb();
});

const MB = 1024 * 1024;

const count = () => Number(db.prepare("SELECT count(*) AS n FROM product_model_files").get()?.n);
const keyOf = (url: string) => url.slice("/product-models/".length);

describe("P3D-001 รับไฟล์ 3 มิติ", () => {
  test("P3D-001 ไฟล์ chair.glb 4.1 MB ถูกรับ ได้ที่อยู่ไฟล์ และเปิดได้พร้อมชื่อและขนาดเดิม", () => {
    const shop = addShop(db);
    const size = Math.round(4.1 * MB);
    const saved = saveModelFile(db, shop.id, "chair.glb", fakeGlb(size));

    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.url).toMatch(/^\/product-models\/[\w-]+$/);
    expect(getModelFile(db, keyOf(saved.url))?.data.byteLength).toBe(size);
    expect(modelFileInfo(db, saved.url)).toEqual({ name: "chair.glb", size });
  });

  test("P3D-001 รูปที่เปลี่ยนนามสกุลเป็น photo.glb และไฟล์ GLB 12 MB ไม่ถูกรับพร้อมเหตุผล และไม่มีไฟล์ถูกเก็บ", () => {
    const shop = addShop(db);
    const jpg = new Uint8Array(2048);
    jpg.set([0xff, 0xd8, 0xff, 0xe0]);

    expect(saveModelFile(db, shop.id, "photo.glb", jpg)).toEqual({ ok: false, error: "ไฟล์ต้องเป็นชนิด GLB" });
    expect(saveModelFile(db, shop.id, "big.glb", fakeGlb(12 * MB))).toEqual({ ok: false, error: "ไฟล์ 3 มิติต้องมีขนาดไม่เกิน 10 MB" });
    expect(count()).toBe(0);
  });

  test("P3D-001 ชื่อไฟล์ว่างหรือยาวเกิน 255 ตัวอักษร ไม่ถูกรับ", () => {
    const shop = addShop(db);
    expect(saveModelFile(db, shop.id, " ", fakeGlb()).ok).toBe(false);
    expect(saveModelFile(db, shop.id, `${"ก".repeat(252)}.glb`, fakeGlb()).ok).toBe(false);
    expect(count()).toBe(0);
  });

  test("P3D-001 ที่อยู่ไฟล์ที่ไม่มีอยู่ เปิดไม่เจอ", () => {
    expect(getModelFile(db, "no-such-key")).toBeNull();
    expect(modelFileInfo(db, "/product-models/no-such-key")).toBeNull();
  });
});

describe("P3D-001 ไฟล์เป็นของร้านที่ส่งขึ้นมาเท่านั้น (PRD-012)", () => {
  test("ร้านที่ส่งไฟล์ใช้ไฟล์นั้นได้ ร้านอื่นและที่อยู่ที่ไม่ใช่ของระบบใช้ไม่ได้", () => {
    const owner = addShop(db);
    const other = addShop(db);
    const saved = saveModelFile(db, owner.id, "chair.glb", fakeGlb());
    if (!saved.ok) throw new Error(saved.error);

    expect(isShopModelUpload(db, owner.id, saved.url)).toBe(true);
    expect(isShopModelUpload(db, other.id, saved.url)).toBe(false);
    expect(isShopModelUpload(db, owner.id, "https://example.com/chair.glb")).toBe(false);
  });
});

describe("P3D-002 ไฟล์ที่ไม่มีสินค้าใช้แล้ว (PRD-014)", () => {
  test("ไฟล์ที่ไม่อยู่ในสินค้าเกิน 1 วันถูกลบตอนร้านนั้นส่งไฟล์ใหม่ ไฟล์ที่สินค้าใช้อยู่และไฟล์ของร้านอื่นไม่ถูกลบ", () => {
    const shop = addShop(db);
    const other = addShop(db);
    const day0 = new Date("2026-11-24T03:00:00.000Z");
    const save = (shopId: number, at: Date) => {
      const saved = saveModelFile(db, shopId, "chair.glb", fakeGlb(), at);
      if (!saved.ok) throw new Error(saved.error);
      return saved.url;
    };
    const used = save(shop.id, day0);
    const unused = save(shop.id, day0);
    const otherUnused = save(other.id, day0);
    const product = addProduct(db, { shopId: shop.id });
    db.prepare("UPDATE products SET model_url = ? WHERE id = ?").run(used, product.id);

    const fresh = save(shop.id, new Date(day0.getTime() + UNUSED_IMAGE_KEEP_MS + 1));

    const kept = (url: string) => getModelFile(db, keyOf(url)) !== null;
    expect([used, otherUnused, fresh].map(kept)).toEqual([true, true, true]);
    expect(kept(unused)).toBe(false);
  });

  test("ไฟล์ที่มีแต่สินค้า ลบแล้ว ใช้ ถือว่าไม่มีสินค้าใช้ ถูกลบเมื่อเกิน 1 วัน ส่วนไฟล์ที่ยังไม่ครบ 1 วันหรือสินค้าที่ยังไม่ลบใช้อยู่ไม่ถูกลบ", () => {
    const shop = addShop(db);
    const day0 = new Date("2026-11-24T03:00:00.000Z");
    const later = new Date(day0.getTime() + UNUSED_IMAGE_KEEP_MS + 1);
    const save = (at: Date) => {
      const saved = saveModelFile(db, shop.id, "chair.glb", fakeGlb(), at);
      if (!saved.ok) throw new Error(saved.error);
      return saved.url;
    };
    const useIn = (url: string, status: ProductStatus) =>
      db.prepare("UPDATE products SET model_url = ? WHERE id = ?").run(url, addProduct(db, { shopId: shop.id, status }).id);
    const ofDeleted = save(day0);
    const recentOfDeleted = save(new Date(later.getTime() - 60_000));
    const ofDeletedAndHidden = save(day0);
    useIn(ofDeleted, PRODUCT_STATUS.deleted);
    useIn(recentOfDeleted, PRODUCT_STATUS.deleted);
    useIn(ofDeletedAndHidden, PRODUCT_STATUS.deleted);
    useIn(ofDeletedAndHidden, PRODUCT_STATUS.hidden);

    save(later);

    const kept = (url: string) => getModelFile(db, keyOf(url)) !== null;
    expect([ofDeleted, recentOfDeleted, ofDeletedAndHidden].map(kept)).toEqual([false, true, true]);
  });
});
