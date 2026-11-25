import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, test } from "vitest";
import { getStorefront } from "@/features/shop/server/storefront";
import { openDb, type Db } from "@/shared/db";
import { addAccount, addOrder, addParcel, addProduct, addShop } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";
import { ORDER_STATUS, PRODUCT_STATUS, SHOP_STATUS } from "@/shared/statuses";
import { PROVINCES } from "@/shared/provinces";
import { checkShopInput, logoLetter, SHOP_ERRORS, type ShopInput } from "./rules";
import { countOrdersAwaitingPacking } from "@/features/shop-orders/server/orders";
import {
  countShopProducts,
  getShopLogo,
  getShopSettings,
  getShopSummary,
  openShop,
  updateShopSettings,
} from "./shops";

let db: Db;
beforeEach(() => {
  db = createTestDb();
});

const somchaiShop: ShopInput = {
  name: "ร้านสมชายผ้าไทย",
  description: "",
  senderName: "สมชาย ใจดี",
  phone: "0812345678",
  address: "99/1 ถนนสุขุมวิท",
  subdistrict: "คลองเตย",
  district: "คลองเตย",
  province: "กรุงเทพมหานคร",
  postcode: "10110",
};

const png = (size: number) => {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return { bytes };
};
const jpg = (size: number) => {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  return { bytes };
};
const pdf = () => ({ bytes: new TextEncoder().encode("%PDF-1.7 ไฟล์เอกสาร") });
const MB = 1024 * 1024;

const shopCount = () => Number(db.prepare("SELECT count(*) AS n FROM shops").get()?.n);

function openSomchaiShop(input: Partial<ShopInput> = {}) {
  const somchai = addAccount(db, { displayName: "สมชาย" });
  const result = openShop(db, somchai.id, { ...somchaiShop, ...input }, undefined);
  if (!result.ok) throw new Error("ต้องเปิดร้านได้");
  return { accountId: somchai.id, shopId: result.shopId };
}

describe("SHP-002 เปิดร้าน", () => {
  test("SHP-002 กรอกครบ 8 ช่อง ได้ร้านสถานะเปิดอยู่ทันที และเปิดหน้าร้านได้", () => {
    const somchai = addAccount(db);
    const now = new Date("2026-11-25T03:01:00.000Z");

    const result = openShop(db, somchai.id, somchaiShop, undefined, now);

    expect(result).toMatchObject({ ok: true });
    const shopId = (result as { shopId: number }).shopId;
    expect(getShopSummary(db, shopId)).toEqual({ id: shopId, name: "ร้านสมชายผ้าไทย", logoUrl: null, status: SHOP_STATUS.open });
    expect(getStorefront(db, shopId)).toMatchObject({ name: "ร้านสมชายผ้าไทย", openedAt: now.toISOString() });
  });

  test("SHP-002 คำอธิบายร้านและโลโก้ร้านใส่ตอนเปิดร้านได้", () => {
    const somchai = addAccount(db);
    const result = openShop(db, somchai.id, { ...somchaiShop, description: "ผ้าไหมทอมือ" }, png(1000));
    const shopId = (result as { shopId: number }).shopId;

    expect(getShopSettings(db, somchai.id)).toMatchObject({ description: "ผ้าไหมทอมือ", logoUrl: expect.stringMatching(/^\/shop-logos\/\d+$/) });
    expect(getShopSummary(db, shopId)?.logoUrl).toMatch(/^\/shop-logos\//);
  });

  test("SHP-002 ระบบบันทึกไม่สำเร็จกลางทาง ไม่มีร้านถูกสร้าง และกดเปิดร้านซ้ำได้", () => {
    const somchai = addAccount(db);
    db.exec("ALTER TABLE shop_logos RENAME TO shop_logos_broken");

    expect(() => openShop(db, somchai.id, somchaiShop, png(1000))).toThrow();
    expect(shopCount()).toBe(0);

    db.exec("ALTER TABLE shop_logos_broken RENAME TO shop_logos");
    expect(openShop(db, somchai.id, somchaiShop, png(1000))).toMatchObject({ ok: true });
  });
});

describe("SHP-003 ตรวจข้อมูลร้านก่อนบันทึก", () => {
  test("SHP-003 กรอกครบตามกติกา ไม่มีข้อความผิดพลาด", () => {
    expect(checkShopInput(somchaiShop).errors).toEqual({});
  });

  test("SHP-003 ชื่อร้าน 2 ตัวอักษร เบอร์ 5 หลัก รหัสไปรษณีย์ว่าง ได้ข้อความ 3 จุด และไม่มีร้านถูกสร้าง", () => {
    const somchai = addAccount(db);

    const result = openShop(db, somchai.id, { ...somchaiShop, name: "สช", phone: "08123", postcode: "" }, undefined);

    expect(result).toEqual({
      ok: false,
      errors: {
        name: "ชื่อร้านต้องมี 3 ถึง 30 ตัวอักษร",
        phone: "เบอร์โทรต้องเป็นตัวเลข 10 หลัก ขึ้นต้นด้วย 0",
        postcode: "กรุณากรอกรหัสไปรษณีย์ 5 หลัก",
      },
    });
    expect(shopCount()).toBe(0);
  });

  test("SHP-003 ขอบของแต่ละช่องตามตารางกติกา", () => {
    const errorsOf = (input: Partial<ShopInput>) => Object.keys(checkShopInput({ ...somchaiShop, ...input }).errors);
    const text = (n: number) => "ก".repeat(n);

    expect(errorsOf({ name: `  ${text(3)}  ` })).toEqual([]);
    expect(errorsOf({ name: text(30) })).toEqual([]);
    expect(errorsOf({ name: text(31) })).toEqual(["name"]);
    expect(errorsOf({ description: text(500) })).toEqual([]);
    expect(errorsOf({ description: text(501) })).toEqual(["description"]);
    expect(errorsOf({ senderName: text(1) })).toEqual(["senderName"]);
    expect(errorsOf({ senderName: text(51) })).toEqual(["senderName"]);
    expect(errorsOf({ phone: "1812345678" })).toEqual(["phone"]);
    expect(errorsOf({ phone: "08123456789" })).toEqual(["phone"]);
    expect(errorsOf({ phone: "08123456ab" })).toEqual(["phone"]);
    expect(errorsOf({ address: text(4) })).toEqual(["address"]);
    expect(errorsOf({ address: text(201) })).toEqual(["address"]);
    expect(errorsOf({ subdistrict: "" })).toEqual(["subdistrict"]);
    expect(errorsOf({ district: text(51) })).toEqual(["district"]);
    expect(errorsOf({ province: "กรุงเทพ" })).toEqual(["province"]);
    expect(errorsOf({ postcode: "1011" })).toEqual(["postcode"]);
    expect(errorsOf({ postcode: "๑๐๑๑๐" })).toEqual(["postcode"]);
  });

  test("SHP-003 รายชื่อจังหวัดมี 77 จังหวัดไม่ซ้ำ", () => {
    expect(new Set(PROVINCES).size).toBe(77);
    expect(PROVINCES).toContain("กรุงเทพมหานคร");
    expect(PROVINCES).toContain("เชียงใหม่");
  });

  test("SHP-003 แก้การตั้งค่าร้านด้วยข้อมูลผิด ไม่บันทึกข้อมูลใดเลย", () => {
    const { accountId, shopId } = openSomchaiShop();

    const result = updateShopSettings(db, accountId, shopId, { ...somchaiShop, description: "ใหม่", name: "สช" }, png(1000));

    expect(result).toEqual({ ok: false, errors: { name: SHOP_ERRORS.name } });
    expect(getShopSettings(db, accountId)).toMatchObject({ name: "ร้านสมชายผ้าไทย", description: "", logoUrl: null });
  });
});

describe("SHP-004 ชื่อร้านไม่ซ้ำกัน", () => {
  test("SHP-004 ชื่อไม่ซ้ำกับร้านที่มีอยู่ เปิดร้านได้", () => {
    openSomchaiShop();
    const wichai = addAccount(db);

    expect(openShop(db, wichai.id, { ...somchaiShop, name: "ร้านวิชัยผ้าไทย" }, undefined)).toMatchObject({ ok: true });
  });

  test("SHP-004 ชื่อซ้ำโดยมีช่องว่างหน้าหลัง หรือต่างแค่ตัวพิมพ์ ไม่มีร้านถูกสร้าง", () => {
    openSomchaiShop({ name: "Coffee House" });
    const wichai = addAccount(db);

    for (const name of [" Coffee House ", "coffee house"]) {
      expect(openShop(db, wichai.id, { ...somchaiShop, name }, undefined)).toEqual({
        ok: false,
        errors: { name: "ชื่อร้านนี้มีคนใช้แล้ว" },
      });
    }
    expect(shopCount()).toBe(1);
  });

  test("SHP-004 สองคนกดเปิดร้านชื่อเดียวกันพร้อมกัน คนแรกได้ร้าน อีกคนเห็นว่าชื่อมีคนใช้แล้ว", () => {
    const [wichai, somying] = [addAccount(db), addAccount(db)];

    const results = [wichai, somying].map((person) => openShop(db, person.id, { ...somchaiShop, name: "บ้านกาแฟ" }, undefined));

    expect(results[0]).toMatchObject({ ok: true });
    expect(results[1]).toEqual({ ok: false, errors: { name: SHOP_ERRORS.nameTaken } });
    expect(getShopSettings(db, somying.id)).toBeNull();
  });

  test("SHP-004 แก้ชื่อร้านเป็นชื่อของร้านอื่นไม่ได้ แต่คงชื่อเดิมของตัวเองได้", () => {
    openSomchaiShop();
    const wichai = addAccount(db);
    const result = openShop(db, wichai.id, { ...somchaiShop, name: "ร้านวิชัยผ้าไทย" }, undefined);
    const shopId = (result as { shopId: number }).shopId;
    const input = { ...somchaiShop, name: "ร้านวิชัยผ้าไทย" };

    expect(updateShopSettings(db, wichai.id, shopId, input, undefined)).toEqual({ ok: true });
    expect(updateShopSettings(db, wichai.id, shopId, { ...input, name: "ร้านสมชายผ้าไทย" }, undefined)).toEqual({
      ok: false,
      errors: { name: SHOP_ERRORS.nameTaken },
    });
  });
});

describe("SHP-005 หนึ่งบัญชีมีได้หนึ่งร้าน", () => {
  test("SHP-005 บัญชีที่มีร้านแล้วเปิดร้านอีก ได้ผลว่ามีร้านแล้ว และยังมีร้านเดียว", () => {
    const { accountId } = openSomchaiShop();

    expect(openShop(db, accountId, { ...somchaiShop, name: "ร้านใหม่" }, undefined)).toEqual({ ok: false, reason: "has-shop" });
    expect(shopCount()).toBe(1);
  });

  test("SHP-005 กดเปิดร้าน 2 ครั้งติดกัน มีร้านเดียว", () => {
    const wichai = addAccount(db);
    const input = { ...somchaiShop, name: "ร้านวิชัยผ้าไทย" };

    const results = [openShop(db, wichai.id, input, undefined), openShop(db, wichai.id, input, undefined)];

    expect(results.map((result) => result.ok)).toEqual([true, false]);
    expect(shopCount()).toBe(1);
  });

  test("SHP-005 เปิดสองหน้าจอ หน้าจอที่สองได้ผลว่ามีร้านแล้ว ไม่มีร้านชื่อที่สอง", () => {
    const wichai = addAccount(db);
    openShop(db, wichai.id, { ...somchaiShop, name: "ร้านวิชัยผ้าไทย" }, undefined);

    expect(openShop(db, wichai.id, { ...somchaiShop, name: "ร้านวิชัย 2" }, undefined)).toEqual({ ok: false, reason: "has-shop" });
    expect(getShopSettings(db, wichai.id)?.name).toBe("ร้านวิชัยผ้าไทย");
  });

  test("SHP-005 บัญชีผู้ดูแลแพลตฟอร์มเปิดร้านไม่ได้", () => {
    const admin = addAccount(db, { isAdmin: true });

    expect(openShop(db, admin.id, somchaiShop, undefined)).toEqual({ ok: false, reason: "admin" });
    expect(shopCount()).toBe(0);
  });
});

describe("SHP-006 ตัวเลขของหน้าแรกของหลังบ้าน", () => {
  test("SHP-006 นับสินค้าที่ขายอยู่ 3 ชิ้น และคำสั่งซื้อที่รอร้านจัดของ 2 รายการ", () => {
    const { shopId } = openSomchaiShop();
    const onSale = [1, 2, 3].map(() => addProduct(db, { shopId, price: 100, stock: 5 }));
    for (const status of [PRODUCT_STATUS.draft, PRODUCT_STATUS.hidden, PRODUCT_STATUS.deleted]) {
      addProduct(db, { shopId, status, price: 100 });
    }
    addProduct(db, { price: 100 });
    const buyer = addAccount(db);
    const variantId = onSale[0].variantIds[0];
    for (const status of [ORDER_STATUS.paid, ORDER_STATUS.paid, ORDER_STATUS.awaitingPayment, ORDER_STATUS.shipping]) {
      addOrder(db, { buyerAccountId: buyer.id, items: [{ variantId }], status });
    }

    expect(countShopProducts(db, shopId)).toEqual({ onSale: 3, listed: 5 });
    expect(countOrdersAwaitingPacking(db, shopId)).toBe(2);
  });

  test("SHP-006 ร้านเพิ่งเปิด ตัวเลขทั้ง 2 ตัวเป็น 0", () => {
    const { shopId } = openSomchaiShop();

    expect(countShopProducts(db, shopId)).toEqual({ onSale: 0, listed: 0 });
    expect(countOrdersAwaitingPacking(db, shopId)).toBe(0);
  });

  test("SHP-006 นับคำสั่งซื้อไม่ได้ ฟังก์ชันโยน error ให้หน้าแสดง – แทน", () => {
    const { shopId } = openSomchaiShop();
    db.exec("ALTER TABLE orders RENAME TO orders_broken");

    expect(() => countOrdersAwaitingPacking(db, shopId)).toThrow();
    expect(countShopProducts(db, shopId)).toEqual({ onSale: 0, listed: 0 });
  });
});

describe("SHP-007 แก้ชื่อร้านและคำอธิบายร้าน", () => {
  test("SHP-007 บันทึกชื่อและคำอธิบายใหม่ หน้าร้านลิงก์เดิมเห็นค่าใหม่", () => {
    const { accountId, shopId } = openSomchaiShop();

    const result = updateShopSettings(
      db,
      accountId,
      shopId,
      { ...somchaiShop, name: "สมชายผ้าไทยแท้", description: "ผ้าไหมทอมือจากสุรินทร์" },
      undefined,
    );

    expect(result).toEqual({ ok: true });
    expect(getStorefront(db, shopId)).toMatchObject({ name: "สมชายผ้าไทยแท้", description: "ผ้าไหมทอมือจากสุรินทร์" });
  });

  test("SHP-007 บันทึกจากสองหน้าจอ ค่าที่บันทึกทีหลังเป็นค่าที่ใช้", () => {
    const { accountId, shopId } = openSomchaiShop();

    updateShopSettings(db, accountId, shopId, { ...somchaiShop, description: "ส่งทุกวัน" }, undefined);
    updateShopSettings(db, accountId, shopId, { ...somchaiShop, description: "ส่งทุกวันจันทร์ถึงศุกร์" }, undefined);

    expect(getShopSettings(db, accountId)?.description).toBe("ส่งทุกวันจันทร์ถึงศุกร์");
  });

  test("SHP-007 ระบบบันทึกไม่สำเร็จกลางทาง หน้าร้านยังแสดงคำอธิบายเดิม", () => {
    const { accountId, shopId } = openSomchaiShop({ description: "คำอธิบายเดิม" });
    db.exec("ALTER TABLE shop_logos RENAME TO shop_logos_broken");

    expect(() =>
      updateShopSettings(db, accountId, shopId, { ...somchaiShop, description: "ก".repeat(40) }, png(1000)),
    ).toThrow();
    expect(getStorefront(db, shopId)?.description).toBe("คำอธิบายเดิม");
  });
});

describe("SHP-008 โลโก้ร้าน", () => {
  test("SHP-008 ร้านที่ยังไม่มีโลโก้ใช้ตัวอักษรตัวแรกของชื่อร้าน", () => {
    expect(logoLetter("ร้านสมชายผ้าไทย")).toBe("ร");
    expect(logoLetter("  บ้านกาแฟ")).toBe("บ");
  });

  test("SHP-008 รูป PNG 1.2 MB ใช้แทนตัวอักษร รูป JPG ใหม่แทนรูปเดิม และลบโลโก้กลับไปใช้ตัวอักษร", () => {
    const { accountId, shopId } = openSomchaiShop();

    expect(updateShopSettings(db, accountId, shopId, somchaiShop, png(1.2 * MB))).toEqual({ ok: true });
    const first = getShopSummary(db, shopId)?.logoUrl ?? "";
    const firstId = Number(first.split("/").at(-1));
    expect(getShopLogo(db, firstId)).toMatchObject({ contentType: "image/png" });
    expect(getShopLogo(db, firstId)?.data.length).toBe(Math.floor(1.2 * MB));

    updateShopSettings(db, accountId, shopId, somchaiShop, jpg(2 * MB));
    const second = getShopSummary(db, shopId)?.logoUrl ?? "";
    expect(second).not.toBe(first);
    expect(getShopLogo(db, firstId)).toBeNull();
    expect(getShopLogo(db, Number(second.split("/").at(-1)))?.contentType).toBe("image/jpeg");

    updateShopSettings(db, accountId, shopId, somchaiShop, "remove");
    expect(getShopSummary(db, shopId)?.logoUrl).toBeNull();
    expect(Number(db.prepare("SELECT count(*) AS n FROM shop_logos").get()?.n)).toBe(0);
  });

  test("SHP-008 รูป JPG 5 MB หรือไฟล์ PDF ถูกปฏิเสธ และโลโก้เดิมยังอยู่", () => {
    const { accountId, shopId } = openSomchaiShop();
    updateShopSettings(db, accountId, shopId, somchaiShop, png(1000));
    const before = getShopSummary(db, shopId)?.logoUrl;

    for (const logo of [jpg(5 * MB), jpg(2 * MB + 1), pdf()]) {
      expect(updateShopSettings(db, accountId, shopId, somchaiShop, logo)).toEqual({
        ok: false,
        errors: { logo: "ใช้ได้เฉพาะรูป JPG หรือ PNG ขนาดไม่เกิน 2 MB" },
      });
    }
    expect(getShopSummary(db, shopId)?.logoUrl).toBe(before);
  });

  test("SHP-008 ตอนเปิดร้าน รูปที่ไม่ใช่ JPG หรือ PNG ทำให้ไม่มีร้านถูกสร้าง", () => {
    const somchai = addAccount(db);

    expect(openShop(db, somchai.id, somchaiShop, pdf())).toEqual({ ok: false, errors: { logo: SHOP_ERRORS.logo } });
    expect(shopCount()).toBe(0);
  });
});

describe("SHP-009 แก้ที่อยู่ต้นทาง", () => {
  test("SHP-009 พัสดุเดิมใช้ที่อยู่เดิม พัสดุใหม่ใช้ที่อยู่ใหม่ และหน้าร้านแสดงจังหวัดใหม่", () => {
    const { accountId, shopId } = openSomchaiShop();
    const product = addProduct(db, { shopId, price: 100, stock: 5 });
    const buyer = addAccount(db);
    const order = () => addOrder(db, { buyerAccountId: buyer.id, items: [{ variantId: product.variantIds[0] }], status: ORDER_STATUS.paid });
    const before = addParcel(db, { orderId: order().id });

    const result = updateShopSettings(
      db,
      accountId,
      shopId,
      { ...somchaiShop, address: "12 ถนนนิมมานเหมินท์", subdistrict: "สุเทพ", district: "เมืองเชียงใหม่", province: "เชียงใหม่", postcode: "50200" },
      undefined,
    );
    const after = addParcel(db, { orderId: order().id });

    expect(result).toEqual({ ok: true });
    const origin = (id: number) => db.prepare("SELECT origin_district, origin_postcode FROM parcels WHERE id = ?").get(id);
    expect(origin(before.id)).toEqual({ origin_district: "คลองเตย", origin_postcode: "10110" });
    expect(origin(after.id)).toEqual({ origin_district: "เมืองเชียงใหม่", origin_postcode: "50200" });
    expect(getStorefront(db, shopId)?.province).toBe("เชียงใหม่");
  });

  test("SHP-009 ลบเบอร์โทรจนว่าง ได้ข้อความผิด และที่อยู่ต้นทางเดิมทั้ง 7 ช่องยังใช้อยู่", () => {
    const { accountId, shopId } = openSomchaiShop();

    const result = updateShopSettings(db, accountId, shopId, { ...somchaiShop, phone: "", province: "เชียงใหม่" }, undefined);

    expect(result).toEqual({ ok: false, errors: { phone: "เบอร์โทรต้องเป็นตัวเลข 10 หลัก ขึ้นต้นด้วย 0" } });
    expect(getShopSettings(db, accountId)).toMatchObject({ phone: "0812345678", province: "กรุงเทพมหานคร" });
  });
});

describe("SHP-014 ร้านที่ถูกระงับ", () => {
  test("SHP-014 ร้านถูกระงับ ยังอ่านการตั้งค่าร้านได้", () => {
    const owner = addAccount(db);
    addShop(db, { ownerAccountId: owner.id, name: "ร้านสมชายผ้าไทย", status: SHOP_STATUS.suspended });

    expect(getShopSettings(db, owner.id)).toMatchObject({ name: "ร้านสมชายผ้าไทย", status: SHOP_STATUS.suspended });
  });

  test("SHP-014 ร้านถูกระงับระหว่างเปิดหน้าตั้งค่า กดบันทึกแล้วไม่รับ ชื่อร้านยังเป็นชื่อเดิม", () => {
    const { accountId, shopId } = openSomchaiShop();
    db.prepare("UPDATE shops SET status = ? WHERE id = ?").run(SHOP_STATUS.suspended, shopId);

    const result = updateShopSettings(db, accountId, shopId, { ...somchaiShop, name: "สมชายผ้าไทยใหม่" }, undefined);

    expect(result).toEqual({ ok: false, reason: "suspended" });
    expect(getShopSettings(db, accountId)?.name).toBe("ร้านสมชายผ้าไทย");
  });
});

describe("SHP-015 เฉพาะเจ้าของร้านแก้ร้านได้", () => {
  test("SHP-015 เจ้าของร้านเห็นชื่อ คำอธิบาย โลโก้ และที่อยู่ต้นทางครบ 7 ช่อง", () => {
    const { accountId, shopId } = openSomchaiShop();

    expect(getShopSettings(db, accountId)).toEqual({
      ...somchaiShop,
      id: shopId,
      status: SHOP_STATUS.open,
      logoUrl: null,
      updatedAt: expect.any(String),
    });
  });

  test("SHP-015 บัญชีอื่นส่งคำขอแก้ร้านนี้ ได้ผลเหมือนร้านไม่มีอยู่ และชื่อร้านไม่เปลี่ยน", () => {
    const somchai = openSomchaiShop();
    const wichai = addAccount(db);
    openShop(db, wichai.id, { ...somchaiShop, name: "ร้านวิชัยผ้าไทย", phone: "0899999999" }, undefined);

    const result = updateShopSettings(db, wichai.id, somchai.shopId, { ...somchaiShop, name: "ร้านของวิชัย" }, undefined);

    expect(result).toEqual({ ok: false, reason: "not-found" });
    expect(getShopSettings(db, somchai.accountId)?.name).toBe("ร้านสมชายผ้าไทย");
    expect(getShopSettings(db, wichai.id)).toMatchObject({ name: "ร้านวิชัยผ้าไทย", phone: "0899999999" });
  });
});

describe("SHP-Q02 ความเร็วการบันทึก", () => {
  const p95 = (run: () => void) => {
    const times = Array.from({ length: 100 }, () => {
      const start = performance.now();
      run();
      return performance.now() - start;
    }).sort((a, b) => a - b);
    return times[94];
  };

  test("SHP-Q02 เปิดร้านและบันทึกการตั้งค่า 100 ครั้ง 95 ครั้งเสร็จภายใน 2 วินาที", () => {
    const { accountId, shopId } = openSomchaiShop();
    let n = 0;

    expect(p95(() => openShop(db, addAccount(db).id, { ...somchaiShop, name: `ร้านทดสอบความเร็ว ${n++}` }, undefined))).toBeLessThan(2000);
    expect(p95(() => updateShopSettings(db, accountId, shopId, { ...somchaiShop, description: `รอบ ${n++}` }, undefined))).toBeLessThan(2000);
  });

  test("SHP-Q02 บันทึกโลโก้ 2 MB 100 ครั้ง 95 ครั้งเสร็จภายใน 5 วินาที และรูปที่ผิดถูกปฏิเสธเร็วเท่ากัน", () => {
    const { accountId, shopId } = openSomchaiShop();

    expect(p95(() => updateShopSettings(db, accountId, shopId, somchaiShop, png(2 * MB)))).toBeLessThan(5000);
    expect(p95(() => updateShopSettings(db, accountId, shopId, somchaiShop, pdf()))).toBeLessThan(2000);
  });
});

describe("SHP-Q06 การเก็บข้อมูล", () => {
  let folder: string;
  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), "blanksong-shp-"));
    return () => rmSync(folder, { recursive: true, force: true });
  });

  test("SHP-Q06 เปิดร้าน ปิดและเปิดระบบใหม่ ข้อมูลร้านและโลโก้ยังครบทุกช่อง", () => {
    const path = join(folder, "test.db");
    const before = openDb(path);
    const owner = addAccount(before);
    const opened = openShop(before, owner.id, { ...somchaiShop, description: "ผ้าไหมทอมือ" }, png(1000));
    const saved = getShopSettings(before, owner.id);
    before.close();

    const after = openDb(path);
    expect(opened.ok).toBe(true);
    expect(getShopSettings(after, owner.id)).toEqual(saved);
    expect(getShopLogo(after, Number(saved?.logoUrl?.split("/").at(-1)))?.data.length).toBe(1000);
    after.close();
  });

  test("SHP-Q06 เปิดระบบใหม่แล้ว ชื่อร้านเดิมยังกันชื่อซ้ำ และบัญชีเดิมยังเปิดร้านที่สองไม่ได้", () => {
    const path = join(folder, "test.db");
    const before = openDb(path);
    const owner = addAccount(before);
    openShop(before, owner.id, somchaiShop, undefined);
    before.close();

    const after = openDb(path);
    expect(openShop(after, addAccount(after).id, somchaiShop, undefined)).toEqual({ ok: false, errors: { name: SHOP_ERRORS.nameTaken } });
    expect(openShop(after, owner.id, { ...somchaiShop, name: "ร้านที่สอง" }, undefined)).toEqual({ ok: false, reason: "has-shop" });
    after.close();
  });
});
