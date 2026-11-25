// กฎของข้อมูลสินค้าที่ทั้งหน้าฟอร์มและเซิร์ฟเวอร์ใช้ร่วมกัน ไฟล์นี้ต้องไม่ import ฐานข้อมูล เพราะหน้าเว็บโหลดไปใช้ด้วย

export const LIMITS = {
  name: 120,
  description: 3000,
  images: 9,
  imageBytes: 5 * 1024 * 1024,
  modelBytes: 10 * 1024 * 1024,
  options: 2,
  values: 10,
  label: 20,
  price: 1_000_000,
} as const;

export const IMAGE_TYPES = ["image/jpeg", "image/png"] as const;

export const MESSAGES = {
  nameRequired: "กรอกชื่อสินค้า",
  nameRequiredForDraft: "กรอกชื่อสินค้าก่อนบันทึกร่าง",
  nameTooLong: "ชื่อสินค้ายาวได้ไม่เกิน 120 ตัวอักษร",
  descriptionRequired: "กรอกรายละเอียดสินค้า",
  descriptionTooLong: "รายละเอียดยาวได้ไม่เกิน 3,000 ตัวอักษร",
  categoryRequired: "เลือกหมวดหมู่",
  imageRequired: "ใส่รูปอย่างน้อย 1 รูป",
  tooManyImages: "ใส่รูปได้ไม่เกิน 9 รูป",
  imageTooLarge: "รูปต้องมีขนาดไม่เกิน 5 MB",
  imageWrongType: "รูปต้องเป็นไฟล์ JPG หรือ PNG",
  imageNotFound: "ไม่พบรูปบางรูป ลบรูปนั้นแล้วใส่ใหม่",
  uploadFailed: "ส่งรูปไม่สำเร็จ",
  modelWrongType: "ไฟล์ต้องเป็นชนิด GLB",
  modelTooLarge: "ไฟล์ 3 มิติต้องมีขนาดไม่เกิน 10 MB",
  modelUploadFailed: "ส่งไฟล์ไม่สำเร็จ",
  modelNotFound: "ไม่พบไฟล์ 3 มิติ เอาไฟล์นั้นออกแล้วใส่ใหม่",
  tooManyOptions: "ใส่ตัวเลือกได้ไม่เกิน 2 ตัวเลือก",
  optionNameRequired: "กรอกชื่อตัวเลือก",
  optionNameTooLong: "ชื่อตัวเลือกยาวได้ไม่เกิน 20 ตัวอักษร",
  duplicateOptionName: "มีชื่อตัวเลือกนี้แล้ว",
  valueRequired: "เพิ่มค่าตัวเลือกอย่างน้อย 1 ค่า",
  valueEmpty: "กรอกค่าตัวเลือก",
  valueTooLong: "ค่าตัวเลือกยาวได้ไม่เกิน 20 ตัวอักษร",
  tooManyValues: "ใส่ค่าตัวเลือกได้ไม่เกิน 10 ค่า",
  duplicateValue: "มีค่าตัวเลือกนี้แล้ว",
  priceRule: "ราคาต้องเป็นจำนวนเต็ม 1 ถึง 1,000,000 บาท",
  pricesIncomplete: "กรอกราคาให้ครบทุกแบบย่อย",
  saveFailed: "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง",
} as const;

export type OptionInput = { name: string; values: string[] };

/** ข้อมูลในหน้าฟอร์มสินค้า ราคาเก็บเป็นข้อความตามที่พิมพ์ โดยใช้ key ของแบบย่อยจาก variantCombos() */
export type ProductValues = {
  name: string;
  description: string;
  categoryId: number | null;
  /** ที่อยู่ของรูปตามลำดับ รูปแรกเป็นรูปปก */
  images: string[];
  options: OptionInput[];
  prices: Record<string, string>;
  /** ที่อยู่ไฟล์ 3 มิติ null ถ้าไม่มี (P3D-001) */
  model: string | null;
};

/** "draft" คือกด "บันทึกร่าง" ส่วน "publish" คือกด "บันทึกและเปิดขาย" */
export type SaveIntent = "draft" | "publish";

/** ข้อความผิดของแต่ละช่อง เช่น name, option.0.values, price.<key ของแบบย่อย> ว่างคือผ่าน */
export type ProductErrors = Record<string, string>;

export const EMPTY_PRODUCT: ProductValues = {
  name: "",
  description: "",
  categoryId: null,
  images: [],
  options: [],
  prices: {},
  model: null,
};

export type VariantCombo = { key: string; values: string[]; label: string };

/** จับคู่ค่าของทุกตัวเลือกครบทุกแบบตามลำดับ ตัวเลือกที่ยังไม่มีค่าไม่นับ */
export function cartesian<T>(lists: T[][]): T[][] {
  return lists
    .filter((list) => list.length > 0)
    .reduce<T[][]>((combos, list) => combos.flatMap((combo) => list.map((item) => [...combo, item])), [[]]);
}

/** แบบย่อยทั้งหมดของตัวเลือกชุดนี้ สินค้าที่ไม่มีตัวเลือกมีแบบย่อยเดียว key "[]" */
export function variantCombos(options: OptionInput[]): VariantCombo[] {
  return cartesian(options.map((option) => option.values)).map((values) => ({
    key: JSON.stringify(values),
    values,
    label: values.join(" "),
  }));
}

/**
 * เหตุที่ไม่รับไฟล์ 3 มิติ หรือ undefined ถ้ารับ (P3D-001) head คือไบต์ต้นไฟล์อย่างน้อย 12 ไบต์ size คือขนาดทั้งไฟล์
 * ตรวจส่วนหัว GLB: "glTF" รุ่น 2 และความยาวในหัวเท่ากับขนาดจริง ไม่เชื่อนามสกุล
 */
export function modelFileError(head: Uint8Array, size: number): string | undefined {
  if (size > LIMITS.modelBytes) return MESSAGES.modelTooLarge;
  if (head.byteLength < 12) return MESSAGES.modelWrongType;
  const view = new DataView(head.buffer, head.byteOffset, 12);
  const glb = view.getUint32(0, true) === 0x46546c67 && view.getUint32(4, true) === 2 && view.getUint32(8, true) === size;
  return glb ? undefined : MESSAGES.modelWrongType;
}

const sameLabel = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** เพิ่มค่าตัวเลือกหนึ่งค่า หรือบอกเหตุที่เพิ่มไม่ได้ */
export function addOptionValue(values: string[], raw: string): { values: string[] } | { error: string } {
  const value = raw.trim();
  if (!value) return { error: MESSAGES.valueEmpty };
  if (value.length > LIMITS.label) return { error: MESSAGES.valueTooLong };
  if (values.some((existing) => sameLabel(existing, value))) return { error: MESSAGES.duplicateValue };
  if (values.length >= LIMITS.values) return { error: MESSAGES.tooManyValues };
  return { values: [...values, value] };
}

/** ราคาเป็นจำนวนเต็มบาท 1 ถึง 1,000,000 หรือ null ถ้าไม่ใช่ */
export function parsePrice(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const price = Number(text);
  return price >= 1 && price <= LIMITS.price ? price : null;
}

function optionValuesError(values: string[], publish: boolean): string | undefined {
  if (values.length === 0) return publish ? MESSAGES.valueRequired : undefined;
  if (values.length > LIMITS.values) return MESSAGES.tooManyValues;
  if (values.some((value) => !value.trim())) return MESSAGES.valueEmpty;
  if (values.some((value) => value.trim().length > LIMITS.label)) return MESSAGES.valueTooLong;
  if (values.some((value, i) => values.slice(0, i).some((other) => sameLabel(other, value)))) return MESSAGES.duplicateValue;
  return undefined;
}

/**
 * ตรวจข้อมูลก่อนบันทึก (PRD-002 PRD-003 PRD-004 PRD-005)
 * ร่างต้องมีแค่ชื่อ ช่องอื่นว่างได้ แต่ถ้ากรอกแล้วต้องถูกรูปแบบ
 */
export function validateProduct(values: ProductValues, intent: SaveIntent): ProductErrors {
  const publish = intent === "publish";
  const errors: ProductErrors = {};

  const name = values.name.trim();
  if (!name) errors.name = publish ? MESSAGES.nameRequired : MESSAGES.nameRequiredForDraft;
  else if (name.length > LIMITS.name) errors.name = MESSAGES.nameTooLong;

  const description = values.description.trim();
  if (publish && !description) errors.description = MESSAGES.descriptionRequired;
  else if (description.length > LIMITS.description) errors.description = MESSAGES.descriptionTooLong;

  if (publish && values.categoryId === null) errors.categoryId = MESSAGES.categoryRequired;

  if (publish && values.images.length === 0) errors.images = MESSAGES.imageRequired;
  else if (values.images.length > LIMITS.images) errors.images = MESSAGES.tooManyImages;

  // ตัวเลือกเกินจำนวนทำให้แบบย่อยมีมหาศาล ต้องหยุดก่อนจับคู่
  if (values.options.length > LIMITS.options) {
    errors.options = MESSAGES.tooManyOptions;
    return errors;
  }
  values.options.forEach((option, i) => {
    const optionName = option.name.trim();
    if (!optionName) {
      if (publish) errors[`option.${i}.name`] = MESSAGES.optionNameRequired;
    } else if (optionName.length > LIMITS.label) {
      errors[`option.${i}.name`] = MESSAGES.optionNameTooLong;
    } else if (values.options.slice(0, i).some((other) => sameLabel(other.name, optionName))) {
      errors[`option.${i}.name`] = MESSAGES.duplicateOptionName;
    }
    const valuesError = optionValuesError(option.values, publish);
    if (valuesError) errors[`option.${i}.values`] = valuesError;
  });
  if (values.options.some((option) => option.values.length > LIMITS.values)) return errors;

  const combos = variantCombos(values.options);
  for (const combo of combos) {
    const text = (values.prices[combo.key] ?? "").trim();
    if (!text) {
      if (publish) errors[`price.${combo.key}`] = combos.length > 1 ? MESSAGES.pricesIncomplete : MESSAGES.priceRule;
    } else if (parsePrice(text) === null) {
      errors[`price.${combo.key}`] = MESSAGES.priceRule;
    }
  }
  return errors;
}

const isText = (value: unknown): value is string => typeof value === "string";

/** อ่านข้อมูลที่หน้าเว็บส่งมา คืน null ถ้ารูปแบบผิด เช่นมีคนส่งเองโดยไม่ผ่านหน้าฟอร์ม */
export function parseProductValues(raw: unknown): ProductValues | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { name, description, categoryId, images, options, prices, model } = raw as Record<string, unknown>;
  if (!isText(name) || !isText(description)) return null;
  if (model !== null && !isText(model)) return null;
  if (categoryId !== null && !Number.isSafeInteger(categoryId)) return null;
  if (!Array.isArray(images) || !images.every(isText)) return null;
  if (!Array.isArray(options)) return null;
  const parsedOptions: OptionInput[] = [];
  for (const option of options as unknown[]) {
    if (typeof option !== "object" || option === null) return null;
    const { name: optionName, values } = option as Record<string, unknown>;
    if (!isText(optionName) || !Array.isArray(values) || !values.every(isText)) return null;
    parsedOptions.push({ name: optionName, values: [...values] });
  }
  if (typeof prices !== "object" || prices === null || Array.isArray(prices)) return null;
  if (!Object.values(prices).every(isText)) return null;
  return {
    name,
    description,
    categoryId: categoryId as number | null,
    images: [...images],
    options: parsedOptions,
    prices: { ...(prices as Record<string, string>) },
    model,
  };
}
