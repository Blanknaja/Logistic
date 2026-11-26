import { priceLabel, sortLabel, type Sort } from "@/features/browse/search-params";
import type { Category } from "@/features/product-listing/server/categories";

// อ่านประโยคในช่องค้นหาเป็นคำค้นกับตัวกรอง (SNT) ไฟล์นี้ใช้ทั้งฝั่งเซิร์ฟเวอร์และในเบราว์เซอร์


// ตัวเลขที่ตามด้วยหน่วยวัดหรือนำด้วยคำบอกขนาด เป็นขนาดของสินค้า ไม่ใช่ราคา (SNT-003)
const MEASURE = String.raw`(?!\s*(?:kg|g\b|กก|ก\.ก|กิโล|กรัม|เมตร|ม\.|ซม|cm|mm|นิ้ว|ลิตร|ml|มล|mah|gb|tb|วัตต์|ชิ้น|คู่|เบอร์))`;
const NOT_SIZE = String.raw`(?<!(?:เบอร์|ไซส์|ขนาด|รุ่น|size)\s*)`;

/** สิ่งที่อ่านได้จากประโยค ช่องที่ไม่มีคือประโยคไม่ได้พูดถึง */
export type Sentence = {
  /** คำค้นที่เหลือหลังตัดส่วนที่เข้าใจออก */
  q: string;
  category?: string;
  min?: number;
  max?: number;
  sort?: Sort;
};

const UNITS: Record<string, number> = { ร้อย: 100, พัน: 1_000, หมื่น: 10_000, แสน: 100_000, ล้าน: 1_000_000, k: 1_000 };

const AMOUNT = String.raw`฿?\s*(?<![\d.,])(\d[\d,]{0,9}(?:\.\d+)?)(?![\d.,])\s*(ร้อย|พัน(?!ธุ์)|หมื่น|แสน|ล้าน|k(?![a-z]))?${MEASURE}`;
const BAHT = String.raw`\s*(?:บาท|฿|บ\.)`;
const SORT_LEAD = String.raw`(?:เรียง(?:จาก|ตาม)?\s*)?(?:ราคา\s*)?`;
const SORT_TAIL = String.raw`ๆ?(?:\s*ก่อน)?`;

const RANGES = [
  new RegExp(String.raw`(?:ราคา\s*)?(?:ระหว่าง|ตั้งแต่)\s*${AMOUNT}(?:${BAHT})?\s*(?:ถึง|กับ|และ|[-–])\s*${AMOUNT}(?:${BAHT})?`, "i"),
  new RegExp(String.raw`ราคา\s*${AMOUNT}(?:${BAHT})?\s*(?:ถึง|กับ|และ|[-–])\s*${AMOUNT}(?:${BAHT})?`, "i"),
  new RegExp(String.raw`${NOT_SIZE}${AMOUNT}(?:${BAHT})?\s*ถึง\s*${AMOUNT}(?:${BAHT})?`, "i"),
  // ขีดอย่างเดียวอาจเป็นรุ่นหรือขนาดของสินค้า จึงต้องมีคำว่าบาทตามหลัง
  new RegExp(String.raw`${AMOUNT}\s*[-–]\s*${AMOUNT}${BAHT}`, "i"),
];
const MAX = new RegExp(String.raw`(?:ราคา\s*)?(ไม่เกิน|งบไม่เกิน|งบ|ไม่ถึง|ต่ำกว่า|ถูกกว่า|น้อยกว่า)\s*${AMOUNT}(?:${BAHT})?`, "i");
const MIN = new RegExp(String.raw`(?:ราคา\s*)?(ตั้งแต่|อย่างน้อย|มากกว่า|แพงกว่า|(?<!ไม่)เกิน)\s*${AMOUNT}(?:${BAHT})?`, "i");
const MIN_AFTER = new RegExp(String.raw`${NOT_SIZE}${AMOUNT}(?:${BAHT})?\s*ขึ้นไป`, "i");
const BELOW = new Set(["ไม่ถึง", "ต่ำกว่า", "ถูกกว่า", "น้อยกว่า"]);
const ABOVE = new Set(["มากกว่า", "แพงกว่า", "เกิน"]);

const SORTS: [Sort, RegExp][] = [
  ["price-asc", new RegExp(String.raw`${SORT_LEAD}ถูก(?:ที่)?สุด${SORT_TAIL}`)],
  ["price-desc", new RegExp(String.raw`${SORT_LEAD}แพง(?:ที่)?สุด${SORT_TAIL}`)],
  ["newest", new RegExp(String.raw`${SORT_LEAD}(?:ใหม่ล่าสุด|ใหม่(?:ที่)?สุด|มาใหม่)${SORT_TAIL}`)],
];

const amount = (digits: string, unit: string | undefined) =>
  Number(digits.replaceAll(",", "")) * (unit ? UNITS[unit.toLowerCase()] : 1);

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** ชื่อที่ยาวกว่ามาก่อน เพื่อให้ "ของใช้ในบ้าน" ไม่ถูกจับเป็น "ของใช้" ของหมวดอื่น */
function namePattern(names: string[]): string {
  return [...names].sort((a, b) => b.length - a.length).map(escapeRegExp).join("|");
}

function readCategory(text: string, categories: Category[]): { id: number; found: string } | null {
  if (categories.length === 0) return null;
  const byName = new Map<string, number>();
  for (const category of categories) {
    for (const part of category.name.split("และ").filter(Boolean)) byName.set(part, category.id);
  }
  for (const category of categories) byName.set(category.name, category.id);

  const named = new RegExp(`หมวด(?:หมู่)?\\s*(${namePattern([...byName.keys()])})`).exec(text);
  if (named) return { id: byName.get(named[1])!, found: named[0] };

  // ชื่อหมวดหมู่ที่มีคำว่า "และ" ไม่ปนกับชื่อสินค้า จึงไม่ต้องมีคำว่าหมวดนำ
  const compound = categories.filter((category) => category.name.includes("และ")).map((category) => category.name);
  if (compound.length === 0) return null;
  const full = new RegExp(namePattern(compound)).exec(text);
  return full ? { id: byName.get(full[0])!, found: full[0] } : null;
}

/**
 * อ่านราคา การเรียง และหมวดหมู่ออกจากประโยค คืน null เมื่อไม่เข้าใจอะไรเลย
 * ซึ่งหมายถึงใช้ทั้งประโยคเป็นคำค้นตามเดิม (SNT-009)
 */
export function readSentence(input: string, categories: Category[]): Sentence | null {
  // จับรูปแบบบนข้อความที่แปลงเลขไทยแล้ว แต่ตัดจากข้อความเดิม คำค้นที่เหลือจึงเป็นตามที่ผู้ซื้อพิมพ์ สองข้อความยาวเท่ากันเสมอ
  let text = input;
  let plain = input.replace(/[๐-๙]/g, (digit) => String(digit.charCodeAt(0) - "๐".charCodeAt(0)));
  const found: Omit<Sentence, "q"> = {};
  const cut = (from: string, start: number, length: number) => `${from.slice(0, start)} ${from.slice(start + length)}`;
  const take = (pattern: RegExp) => {
    const match = pattern.exec(plain);
    if (match) {
      text = cut(text, match.index, match[0].length);
      plain = cut(plain, match.index, match[0].length);
    }
    return match;
  };

  const range = RANGES.reduce<RegExpExecArray | null>((match, pattern) => match ?? take(pattern), null);
  if (range) {
    found.min = Math.ceil(amount(range[1], range[2]));
    found.max = Math.floor(amount(range[3], range[4]));
  } else {
    const max = take(MAX);
    if (max) {
      const value = amount(max[2], max[3]);
      found.max = BELOW.has(max[1]) ? Math.ceil(value) - 1 : Math.floor(value);
    }
    const min = take(MIN);
    if (min) {
      const value = amount(min[2], min[3]);
      found.min = ABOVE.has(min[1]) ? Math.floor(value) + 1 : Math.ceil(value);
    } else {
      const after = take(MIN_AFTER);
      if (after) found.min = Math.ceil(amount(after[1], after[2]));
    }
  }

  for (const [sort, pattern] of SORTS) {
    if (take(pattern)) {
      found.sort = sort;
      break;
    }
  }

  const category = readCategory(text, categories);
  if (category) {
    found.category = String(category.id);
    text = cut(text, text.indexOf(category.found), category.found.length);
  }

  if (Object.keys(found).length === 0) return null;
  return { q: text.replace(/\s+/g, " ").trim(), ...found };
}

/** สิ่งที่เข้าใจจากประโยค เป็นคำสั้นๆ ตามลำดับ คำค้น หมวดหมู่ ราคา การเรียง (SNT-011) */
export function understoodLabels(sentence: Sentence, categories: Category[]): string[] {
  const category = categories.find((item) => String(item.id) === sentence.category);
  const price = priceLabel(sentence.min ?? null, sentence.max ?? null);
  return [
    sentence.q && `“${sentence.q}”`,
    category?.name,
    price,
    sentence.sort && sortLabel(sentence.sort),
  ].filter((label): label is string => Boolean(label));
}
