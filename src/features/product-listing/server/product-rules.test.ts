import { describe, expect, test } from "vitest";
import {
  addOptionValue,
  EMPTY_PRODUCT,
  MESSAGES,
  modelFileError,
  parseProductValues,
  validateProduct,
  variantCombos,
  type ProductValues,
} from "./product-rules";
import { CHAIR_GLB_BYTES } from "./testing";

const tshirt = (overrides: Partial<ProductValues> = {}): ProductValues => ({
  name: "เสื้อยืดคอกลม",
  description: "ผ้าฝ้าย 100%",
  categoryId: 1,
  images: ["/product-images/a"],
  options: [],
  prices: { "[]": "250" },
  model: null,
  ...overrides,
});

const colorSize = [
  { name: "สี", values: ["แดง", "ดำ"] },
  { name: "ขนาด", values: ["M", "L"] },
];

describe("PRD-002 ข้อมูลที่ต้องครบก่อนเปิดขาย", () => {
  test("PRD-002 กรอกครบทุกช่อง เปิดขายได้", () => {
    expect(validateProduct(tshirt(), "publish")).toEqual({});
  });

  test("PRD-002 ราคา 0 ไม่เลือกหมวดหมู่ ไม่กรอกรายละเอียด เห็นข้อความใต้ทุกช่องที่ผิดพร้อมกัน", () => {
    const errors = validateProduct(
      tshirt({ name: "กางเกงขาสั้น", description: "", categoryId: null, prices: { "[]": "0" } }),
      "publish",
    );
    expect(errors).toEqual({
      description: "กรอกรายละเอียดสินค้า",
      categoryId: "เลือกหมวดหมู่",
      "price.[]": "ราคาต้องเป็นจำนวนเต็ม 1 ถึง 1,000,000 บาท",
    });
  });

  test("PRD-002 ชื่อยาวเกิน 120 ตัวอักษร รายละเอียดเกิน 3,000 ตัวอักษร ราคามีทศนิยม หรือเกิน 1,000,000 บาท ไม่ผ่าน", () => {
    const errors = validateProduct(
      tshirt({ name: "ก".repeat(121), description: "ข".repeat(3001), prices: { "[]": "12.5" } }),
      "publish",
    );
    expect(errors.name).toBe("ชื่อสินค้ายาวได้ไม่เกิน 120 ตัวอักษร");
    expect(errors.description).toBe("รายละเอียดยาวได้ไม่เกิน 3,000 ตัวอักษร");
    expect(errors["price.[]"]).toBe(MESSAGES.priceRule);
    expect(validateProduct(tshirt({ prices: { "[]": "1000001" } }), "publish")["price.[]"]).toBe(MESSAGES.priceRule);
    expect(validateProduct(tshirt({ prices: { "[]": "1000000" } }), "publish")).toEqual({});
  });

  test("PRD-002 ไม่มีรูปเลย เปิดขายไม่ได้", () => {
    expect(validateProduct(tshirt({ images: [] }), "publish").images).toBe("ใส่รูปอย่างน้อย 1 รูป");
  });
});

describe("PRD-003 จำนวนรูปต่อสินค้า", () => {
  test("PRD-003 รูป 9 รูปผ่าน", () => {
    const images = Array.from({ length: 9 }, (_, i) => `/product-images/${i}`);
    expect(validateProduct(tshirt({ images }), "publish")).toEqual({});
  });

  test("PRD-003 รูป 10 รูปไม่ผ่าน แม้เป็นร่าง", () => {
    const images = Array.from({ length: 10 }, (_, i) => `/product-images/${i}`);
    expect(validateProduct(tshirt({ images }), "draft").images).toBe("ใส่รูปได้ไม่เกิน 9 รูป");
  });
});

describe("PRD-004 ตัวเลือกและแบบย่อย", () => {
  test("PRD-004 สี 2 ค่า กับขนาด 2 ค่า ได้แบบย่อย 4 แบบ เรียง แดง M, แดง L, ดำ M, ดำ L", () => {
    expect(variantCombos(colorSize).map((combo) => combo.label)).toEqual(["แดง M", "แดง L", "ดำ M", "ดำ L"]);
  });

  test("PRD-004 ไม่มีตัวเลือก มีแบบย่อยเดียว", () => {
    expect(variantCombos([])).toEqual([{ key: "[]", values: [], label: "" }]);
  });

  test("PRD-004 กรอกราคาครบทุกแบบย่อย เปิดขายได้", () => {
    const prices = Object.fromEntries(variantCombos(colorSize).map((combo, i) => [combo.key, ["250", "250", "270", "290"][i]]));
    expect(validateProduct(tshirt({ options: colorSize, prices }), "publish")).toEqual({});
  });

  test("PRD-004 เพิ่มค่าตัวเลือกใหม่ได้ ตัดช่องว่างหัวท้าย", () => {
    expect(addOptionValue(["แดง"], "  ดำ ")).toEqual({ values: ["แดง", "ดำ"] });
  });

  test("PRD-004 เพิ่มค่า แดง ซ้ำ เห็นข้อความ มีค่าตัวเลือกนี้แล้ว และค่าไม่ถูกเพิ่ม", () => {
    expect(addOptionValue(["แดง", "ดำ"], "แดง")).toEqual({ error: "มีค่าตัวเลือกนี้แล้ว" });
    expect(addOptionValue(["M"], "m")).toEqual({ error: "มีค่าตัวเลือกนี้แล้ว" });
  });

  test("PRD-004 ค่าตัวเลือกว่าง เกิน 20 ตัวอักษร หรือครบ 10 ค่าแล้ว เพิ่มไม่ได้", () => {
    expect(addOptionValue([], "  ")).toEqual({ error: "กรอกค่าตัวเลือก" });
    expect(addOptionValue([], "ก".repeat(21))).toEqual({ error: "ค่าตัวเลือกยาวได้ไม่เกิน 20 ตัวอักษร" });
    const ten = Array.from({ length: 10 }, (_, i) => `ค่า${i}`);
    expect(addOptionValue(ten, "ใหม่")).toEqual({ error: "ใส่ค่าตัวเลือกได้ไม่เกิน 10 ค่า" });
  });

  test("PRD-004 แถว ดำ L ยังไม่มีราคา เห็นข้อความ กรอกราคาให้ครบทุกแบบย่อย ที่แถวนั้น", () => {
    const [redM, redL, blackM, blackL] = variantCombos(colorSize);
    const errors = validateProduct(
      tshirt({ options: colorSize, prices: { [redM.key]: "250", [redL.key]: "250", [blackM.key]: "270" } }),
      "publish",
    );
    expect(errors).toEqual({ [`price.${blackL.key}`]: "กรอกราคาให้ครบทุกแบบย่อย" });
  });

  test("PRD-004 ตัวเลือกที่สามไม่ผ่าน", () => {
    const options = [...colorSize, { name: "ลาย", values: ["ทาง"] }];
    expect(validateProduct(tshirt({ options }), "draft").options).toBe("ใส่ตัวเลือกได้ไม่เกิน 2 ตัวเลือก");
  });

  test("PRD-004 ชื่อตัวเลือกว่างหรือซ้ำ ค่าตัวเลือกซ้ำ ตัวเลือกไม่มีค่า ไม่ผ่านตอนเปิดขาย", () => {
    const errors = validateProduct(
      tshirt({
        options: [
          { name: "สี", values: ["แดง", "แดง"] },
          { name: "สี", values: [] },
        ],
        prices: {},
      }),
      "publish",
    );
    expect(errors["option.0.values"]).toBe("มีค่าตัวเลือกนี้แล้ว");
    expect(errors["option.1.name"]).toBe("มีชื่อตัวเลือกนี้แล้ว");
    expect(errors["option.1.values"]).toBe("เพิ่มค่าตัวเลือกอย่างน้อย 1 ค่า");
    expect(validateProduct(tshirt({ options: [{ name: " ", values: ["แดง"] }], prices: { '["แดง"]': "1" } }), "publish")).toEqual({
      "option.0.name": "กรอกชื่อตัวเลือก",
    });
  });

  test("PRD-004 ส่งตัวเลือกเกินมาก ระบบไม่สร้างแบบย่อยให้ ตอบผิดทันที", () => {
    const options = Array.from({ length: 40 }, (_, i) => ({ name: `ต${i}`, values: Array.from({ length: 10 }, (_, j) => `${j}`) }));
    expect(validateProduct(tshirt({ options }), "publish").options).toBe(MESSAGES.tooManyOptions);
  });
});

describe("PRD-005 บันทึกเป็นร่าง", () => {
  test("PRD-005 มีชื่อกับราคา ไม่มีรูปและหมวดหมู่ บันทึกร่างได้", () => {
    expect(validateProduct({ ...EMPTY_PRODUCT, name: "หมวกแก๊ป", prices: { "[]": "120" } }, "draft")).toEqual({});
  });

  test("PRD-005 ไม่มีชื่อ เห็นข้อความ กรอกชื่อสินค้าก่อนบันทึกร่าง", () => {
    expect(validateProduct({ ...EMPTY_PRODUCT, prices: { "[]": "120" } }, "draft")).toEqual({
      name: "กรอกชื่อสินค้าก่อนบันทึกร่าง",
    });
  });

  test("PRD-005 ร่างที่กรอกราคาผิดรูปแบบไว้ ยังบันทึกไม่ได้", () => {
    expect(validateProduct({ ...EMPTY_PRODUCT, name: "หมวกแก๊ป", prices: { "[]": "-5" } }, "draft")).toEqual({
      "price.[]": MESSAGES.priceRule,
    });
  });
});

describe("ข้อมูลที่ส่งมาจากหน้าเว็บ", () => {
  test("ข้อมูลรูปแบบถูก อ่านได้ครบ", () => {
    expect(parseProductValues(tshirt({ options: colorSize }))).toEqual(tshirt({ options: colorSize }));
  });

  test("ข้อมูลรูปแบบผิด ไม่รับ", () => {
    expect(parseProductValues(null)).toBeNull();
    expect(parseProductValues({ ...tshirt(), categoryId: "1" })).toBeNull();
    expect(parseProductValues({ ...tshirt(), images: [1] })).toBeNull();
    expect(parseProductValues({ ...tshirt(), options: [{ name: "สี", values: "แดง" }] })).toBeNull();
    expect(parseProductValues({ ...tshirt(), prices: { "[]": 250 } })).toBeNull();
    expect(parseProductValues({ ...tshirt(), model: 1 })).toBeNull();
    expect(parseProductValues({ ...tshirt(), model: undefined })).toBeNull();
  });

  test("P3D-001 ที่อยู่ไฟล์ 3 มิติอ่านได้ และสินค้าที่ไม่มีไฟล์ได้ null", () => {
    expect(parseProductValues(tshirt({ model: "/product-models/a" }))?.model).toBe("/product-models/a");
    expect(parseProductValues(tshirt())?.model).toBeNull();
  });
});

const MB = 1024 * 1024;

/** ไฟล์ที่ส่วนหัวเป็น GLB รุ่น 2 และบอกความยาวไว้เท่ากับขนาดจริง */
function glb(size: number, { version = 2, declared = size } = {}): Uint8Array {
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  bytes.set([0x67, 0x6c, 0x54, 0x46]);
  view.setUint32(4, version, true);
  view.setUint32(8, declared, true);
  return bytes;
}

describe("P3D-001 ตรวจไฟล์ 3 มิติจากเนื้อไฟล์", () => {
  test("P3D-001 ไฟล์ GLB 3.9 MB และ 10 MB พอดีถูกรับ", () => {
    const chair = glb(CHAIR_GLB_BYTES);
    expect(modelFileError(chair, chair.byteLength)).toBeUndefined();
    expect(modelFileError(glb(10 * MB), 10 * MB)).toBeUndefined();
  });

  test("P3D-001 รูป JPG ที่เปลี่ยนนามสกุลเป็น .glb ไม่ถูกรับ เห็น ไฟล์ต้องเป็นชนิด GLB", () => {
    const jpg = new Uint8Array(2048);
    jpg.set([0xff, 0xd8, 0xff, 0xe0]);
    expect(modelFileError(jpg, jpg.byteLength)).toBe("ไฟล์ต้องเป็นชนิด GLB");
  });

  test("P3D-001 ไฟล์ GLB 12 MB ไม่ถูกรับ เห็น ไฟล์ 3 มิติต้องมีขนาดไม่เกิน 10 MB", () => {
    expect(modelFileError(glb(12, { declared: 12 * MB }), 12 * MB)).toBe("ไฟล์ 3 มิติต้องมีขนาดไม่เกิน 10 MB");
  });

  test("P3D-001 ส่วนหัวรุ่นอื่น ความยาวในหัวไม่ตรงกับขนาดจริง หรือไฟล์สั้นกว่าส่วนหัว ไม่ถูกรับ", () => {
    expect(modelFileError(glb(100, { version: 1 }), 100)).toBe(MESSAGES.modelWrongType);
    expect(modelFileError(glb(100, { declared: 99 }), 100)).toBe(MESSAGES.modelWrongType);
    expect(modelFileError(glb(100), 101)).toBe(MESSAGES.modelWrongType);
    expect(modelFileError(glb(12).slice(0, 8), 8)).toBe(MESSAGES.modelWrongType);
  });
});
