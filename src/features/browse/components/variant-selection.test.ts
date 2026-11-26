import { describe, expect, test } from "vitest";
import {
  blockedReason,
  findVariant,
  isValueSoldOut,
  missingOptionMessage,
  priceText,
  stockText,
} from "@/features/browse/components/variant-selection";
import type { ProductDetail } from "@/features/browse/server/product-detail";

const RED = 11;
const BLACK = 12;
const M = 21;
const L = 22;

const shirt: Pick<ProductDetail, "options" | "variants"> = {
  options: [
    { id: 1, name: "สี", values: [{ id: RED, value: "แดง" }, { id: BLACK, value: "ดำ" }] },
    { id: 2, name: "ขนาด", values: [{ id: M, value: "M" }, { id: L, value: "L" }] },
  ],
  variants: [
    { id: 101, valueIds: [RED, M], label: "แดง M", price: 199, stock: 3 },
    { id: 102, valueIds: [RED, L], label: "แดง L", price: 209, stock: 4 },
    { id: 103, valueIds: [BLACK, M], label: "ดำ M", price: 199, stock: 2 },
    { id: 104, valueIds: [BLACK, L], label: "ดำ L", price: 219, stock: 0 },
  ],
};

const cap: Pick<ProductDetail, "options" | "variants"> = {
  options: [],
  variants: [{ id: 201, valueIds: [], label: "", price: 150, stock: 1 }],
};

describe("BRW-009 ตัวเลือกและสต็อกที่เหลือ", () => {
  test("ก่อนเลือกเห็นช่วงราคา เลือกครบแล้วเห็นราคาและสต็อกของแบบย่อยนั้น", () => {
    expect(priceText(shirt.variants)).toBe("฿199 - ฿219");
    expect(findVariant(shirt, [RED, null])).toBeNull();

    const picked = findVariant(shirt, [RED, M]);

    expect(picked?.id).toBe(101);
    expect(priceText([picked!])).toBe("฿199");
    expect(stockText(picked!.stock)).toBe("เหลือ 3 ชิ้น");
  });

  test("แบบย่อยที่สต็อกเป็น 0 เห็นสินค้าหมด และกดใส่ตะกร้าไม่ได้", () => {
    expect(stockText(0)).toBe("สินค้าหมด");
    expect(blockedReason(shirt, [BLACK, L], false)).toBe("สินค้าหมด");
    expect(blockedReason({ ...cap, variants: [{ ...cap.variants[0], stock: 0 }] }, [], false)).toBe("สินค้าหมด");
  });

  test("ค่าตัวเลือกที่ทุกแบบย่อยที่เข้ากับค่าที่เลือกไว้หมดสต็อก เห็นเป็นค่าที่หมด", () => {
    expect(isValueSoldOut(shirt, [null, null], 0, BLACK)).toBe(false);
    expect(isValueSoldOut(shirt, [null, null], 1, L)).toBe(false);
    expect(isValueSoldOut(shirt, [BLACK, null], 1, L)).toBe(true);
    expect(isValueSoldOut(shirt, [BLACK, null], 1, M)).toBe(false);
    expect(isValueSoldOut(shirt, [null, L], 0, BLACK)).toBe(true);
    // ค่าที่เลือกอยู่ของตัวเลือกเดียวกันไม่นับ จึงยังเห็นได้ว่าค่าอื่นของตัวเลือกนั้นมีของ
    expect(isValueSoldOut(shirt, [BLACK, L], 0, RED)).toBe(false);
  });

  test("สินค้าที่ไม่มีตัวเลือก มีแบบย่อยเดียวที่ถือว่าเลือกครบแล้ว", () => {
    expect(findVariant(cap, [])?.id).toBe(201);
    expect(priceText(cap.variants)).toBe("฿150");
    expect(stockText(1)).toBe("เหลือ 1 ชิ้น");
    expect(stockText(1500)).toBe("เหลือ 1,500 ชิ้น");
  });
});

describe("BRW-010 ปุ่มใส่ตะกร้า", () => {
  test("เลือกครบและมีสต็อก กดได้", () => {
    expect(blockedReason(shirt, [RED, M], false)).toBeNull();
    expect(missingOptionMessage(shirt.options, [RED, M])).toBeNull();
    expect(blockedReason(cap, [], false)).toBeNull();
  });

  test("สินค้าของร้านตัวเองกดไม่ได้ และยังเลือกไม่ครบเห็นข้อความตาม CRT-001", () => {
    expect(blockedReason(shirt, [RED, M], true)).toBe("ซื้อสินค้าจากร้านตัวเองไม่ได้");
    expect(blockedReason(shirt, [BLACK, null], false)).toBeNull();
    expect(missingOptionMessage(shirt.options, [BLACK, null])).toBe("กรุณาเลือกขนาด");
    expect(missingOptionMessage(shirt.options, [null, null])).toBe("กรุณาเลือกสี");
  });
});
