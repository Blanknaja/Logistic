import { beforeEach, describe, expect, test } from "vitest";
import { getProductDetail } from "@/features/browse/server/product-detail";
import type { Db } from "@/shared/db";
import { addProduct, addShop } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";
import { saveModelFile } from "./model-files";
import { MESSAGES } from "./product-rules";
import { createProduct, getProductForEdit, setProductHidden, updateProduct } from "./products";
import { CHAIR_GLB_BYTES, fakeGlb } from "./testing";

let db: Db;
let shopId: number;
beforeEach(() => {
  db = createTestDb();
  shopId = addShop(db, { name: "ร้านสมชาย" }).id;
});

const at =(time: string) => new Date(`2026-11-25T${time}:00+07:00`);

function uploadModel(name = "chair.glb", size = 100, forShop = shopId): string {
  const saved = saveModelFile(db, forShop, name, fakeGlb(size));
  if (!saved.ok) throw new Error(saved.error);
  return saved.url;
}

/** "เก้าอี้ผ้ากำมะหยี่" ขายอยู่ รูป 3 รูป ยังไม่มีไฟล์ 3 มิติ */
const chair = () =>
  addProduct(db, {
    shopId,
    name: "เก้าอี้ผ้ากำมะหยี่",
    images: ["/sample-images/c1.svg", "/sample-images/c2.svg", "/sample-images/c3.svg"],
    createdAt: at("09:00").toISOString(),
  }).id;

function opened(productId: number) {
  const product = getProductForEdit(db, shopId, productId);
  if (!product) throw new Error("ไม่พบสินค้า");
  return product;
}

function save(productId: number, model: string | null, time: string) {
  const form = opened(productId);
  return updateProduct(db, shopId, productId, form.updatedAt, { ...form.values, model }, "publish", at(time));
}

describe("P3D-001 ผู้ขายเพิ่มไฟล์ 3 มิติ", () => {
  test("P3D-001 ใส่ chair.glb 3.9 MB แล้วบันทึก หน้าฟอร์มเห็นชื่อและขนาดไฟล์ และหน้าสินค้ามีไฟล์ 3 มิติ", () => {
    const id = chair();
    const url = uploadModel("chair.glb", CHAIR_GLB_BYTES);

    expect(save(id, url, "10:01")?.ok).toBe(true);
    expect(opened(id)).toMatchObject({ values: { model: url }, modelFile: { name: "chair.glb", size: CHAIR_GLB_BYTES } });
    expect(getProductDetail(db, id)?.model).toBe(url);
  });

  test("P3D-001 สร้างสินค้าใหม่พร้อมไฟล์ 3 มิติได้ และไม่ใส่ไฟล์ก็ได้", () => {
    const url = uploadModel();
    const values = { name: "เก้าอี้", description: "ผ้ากำมะหยี่", categoryId: 6, images: [], options: [], prices: { "[]": "1990" } };

    const withModel = createProduct(db, shopId, { ...values, model: url }, "draft");
    const without = createProduct(db, shopId, { ...values, model: null }, "draft");
    if (!withModel.ok || !without.ok) throw new Error("บันทึกไม่สำเร็จ");
    expect(opened(withModel.productId).values.model).toBe(url);
    expect(opened(without.productId)).toMatchObject({ values: { model: null }, modelFile: null });
  });

  test("P3D-001 ใช้ไฟล์ที่ร้านอื่นส่งขึ้นมา หรือที่อยู่ที่ไม่ใช่ของระบบไม่ได้ และสินค้าไม่เปลี่ยน (PRD-012)", () => {
    const id = chair();
    const before = opened(id);
    const otherShopModel = uploadModel("other.glb", 100, addShop(db).id);

    for (const model of [otherShopModel, "https://example.com/chair.glb"]) {
      expect(save(id, model, "10:02")).toEqual({ ok: false, errors: { model: MESSAGES.modelNotFound } });
      expect(createProduct(db, shopId, { ...before.values, model }, "publish").ok).toBe(false);
    }
    expect(opened(id)).toEqual(before);
  });
});

describe("P3D-002 เปลี่ยนและเอาไฟล์ 3 มิติออก", () => {
  test("P3D-002 กด เอาออก แล้วบันทึก ช่องว่าง หน้าสินค้าไม่มีไฟล์ 3 มิติ และรูปยังอยู่ครบ", () => {
    const id = chair();
    save(id, uploadModel(), "11:00");

    expect(save(id, null, "11:01")?.ok).toBe(true);
    expect(opened(id)).toMatchObject({ values: { model: null }, modelFile: null });
    expect(getProductDetail(db, id)).toMatchObject({ model: null, images: ["/sample-images/c1.svg", "/sample-images/c2.svg", "/sample-images/c3.svg"] });
  });

  test("P3D-002 เลือกไฟล์ใหม่แทนไฟล์เดิมแล้วบันทึก หน้าสินค้าใช้ไฟล์ใหม่", () => {
    const id = chair();
    save(id, uploadModel("chair.glb"), "11:00");
    const replacement = uploadModel("chair-v2.glb", 200);

    expect(save(id, replacement, "11:05")?.ok).toBe(true);
    expect(opened(id).modelFile).toEqual({ name: "chair-v2.glb", size: 200 });
    expect(getProductDetail(db, id)?.model).toBe(replacement);
  });

  test("P3D-002 ส่งไฟล์ใหม่แต่ออกจากหน้าฟอร์มโดยไม่บันทึก สินค้ายังมีไฟล์เดิม", () => {
    const id = chair();
    const original = uploadModel("chair.glb");
    save(id, original, "11:10");
    uploadModel("chair-v2.glb");

    expect(opened(id).modelFile?.name).toBe("chair.glb");
    expect(getProductDetail(db, id)?.model).toBe(original);
  });
});

describe("P3D-003 สินค้าที่ผู้ซื้อเปิดไม่ได้", () => {
  test("P3D-003 สินค้าที่ถูกซ่อนไม่มีหน้าสินค้า จึงไม่มีรูปและไฟล์ 3 มิติให้เห็น", () => {
    const id = chair();
    save(id, uploadModel(), "12:00");
    expect(setProductHidden(db, shopId, id, true)).toBe(true);
    expect(getProductDetail(db, id)).toBeNull();
  });
});
