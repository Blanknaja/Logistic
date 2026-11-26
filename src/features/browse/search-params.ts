import { minRatingLabel, parseStars } from "@/features/review/rules";
import { formatBaht, formatNumber } from "@/shared/format";

// ค่าค้นหาทั้งหมดอยู่ในที่อยู่หน้าเว็บ (BRW-006) ไฟล์นี้ใช้ทั้งฝั่งเซิร์ฟเวอร์และในเบราว์เซอร์

export const MAX_QUERY_LENGTH = 100;
export const MAX_PRICE = 1_000_000;

export const SORT_LABELS = {
  newest: "ใหม่ล่าสุด",
  "price-asc": "ราคาต่ำไปสูง",
  "price-desc": "ราคาสูงไปต่ำ",
  rating: "คะแนนสูงสุด",
} as const;

export type Sort = keyof typeof SORT_LABELS;

export type BrowseParams = {
  q: string;
  /** เลขหมวดหมู่ตามที่อยู่ในที่อยู่หน้าเว็บ ยังไม่รู้ว่ามีอยู่จริงไหม */
  category: string | null;
  min: number | null;
  max: number | null;
  /** คะแนนเฉลี่ยขั้นต่ำ 1 ถึง 5 ดาว (REV-011) */
  rating: number | null;
  sort: Sort;
  page: number;
};

export type RawSearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

export function normalizeQuery(value: string): string {
  return value.trim().slice(0, MAX_QUERY_LENGTH).trim();
}

/** ตัวเลขล้วนเท่านั้น ค่าอื่นถือว่าไม่ได้กรอก */
export function parsePrice(value: string): number | null {
  const text = value.trim();
  return /^\d+$/.test(text) ? Number(text) : null;
}

export function parseBrowseParams(raw: RawSearchParams): BrowseParams {
  const sort = first(raw.sort);
  const page = Number(first(raw.page));
  return {
    q: normalizeQuery(first(raw.q)),
    category: first(raw.category).trim() || null,
    min: parsePrice(first(raw.min)),
    max: parsePrice(first(raw.max)),
    rating: parseStars(first(raw.rating)),
    sort: Object.hasOwn(SORT_LABELS, sort) ? (sort as Sort) : "newest",
    page: Number.isSafeInteger(page) && page >= 1 ? page : 1,
  };
}

export function priceError(min: number | null, max: number | null): string | null {
  if ((min ?? 0) > MAX_PRICE || (max ?? 0) > MAX_PRICE) return `ราคาต้องไม่เกิน ${formatNumber(MAX_PRICE)} บาท`;
  if (min !== null && max !== null && min > max) return "ราคาต่ำสุดต้องไม่มากกว่าราคาสูงสุด";
  return null;
}

/** ช่วงราคาเป็นคำสั้นๆ หรือ null ถ้าไม่ได้กรองราคา */
export function priceLabel(min: number | null, max: number | null): string | null {
  if (min !== null && max !== null) return `ราคา ${formatBaht(min)} ถึง ${formatBaht(max)}`;
  if (min !== null) return `ราคาตั้งแต่ ${formatBaht(min)}`;
  if (max !== null) return `ราคาไม่เกิน ${formatBaht(max)}`;
  return null;
}

/** คะแนนขั้นต่ำเป็นคำสั้นๆ หรือ null ถ้าไม่ได้กรองคะแนน (REV-011) */
export const ratingLabel = (rating: number | null) => (rating === null ? null : `คะแนน ${minRatingLabel(rating)}`);

/** การเรียงเป็นคำสั้นๆ ที่อ่านรู้เรื่องเมื่ออยู่นอกช่องเลือกการเรียง */
export const sortLabel = (sort: Sort) => `เรียง${SORT_LABELS[sort]}`;

/** ที่อยู่ของหน้ารายการสินค้า ค่าที่เป็นค่าเริ่มต้นไม่ถูกใส่ */
export function browseHref(params: Partial<BrowseParams>): string {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.category) query.set("category", params.category);
  if (params.min != null) query.set("min", String(params.min));
  if (params.max != null) query.set("max", String(params.max));
  if (params.rating != null) query.set("rating", String(params.rating));
  if (params.sort && params.sort !== "newest") query.set("sort", params.sort);
  if (params.page && params.page > 1) query.set("page", String(params.page));
  const text = query.toString();
  return text ? `/?${text}` : "/";
}

/** มีคำค้นหรือตัวกรองอยู่ไหม การเรียงไม่นับ */
export function hasCriteria(params: BrowseParams): boolean {
  return params.q !== "" || params.category !== null || params.min !== null || params.max !== null || params.rating !== null;
}
