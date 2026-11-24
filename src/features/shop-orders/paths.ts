import { ORDER_STATUS } from "@/shared/statuses";

// ตัวกรอง คำค้น หน้า และ asOf อยู่ในที่อยู่หน้าเว็บ โหลดใหม่หรือกลับจากหน้ารายละเอียดจึงอยู่ที่เดิม
// ไฟล์นี้ใช้ทั้งฝั่งเซิร์ฟเวอร์และในเบราว์เซอร์

export const MIN_QUERY_LENGTH = 3;
export const QUERY_TOO_SHORT = `พิมพ์อย่างน้อย ${MIN_QUERY_LENGTH} ตัวอักษร`;

export type StatusKey = keyof typeof ORDER_STATUS;

export type ListParams = {
  status: StatusKey | null;
  q: string;
  page: number;
  asOf: number | null;
};

type RawSearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

function positiveInt(value: string): number | null {
  const number = Number(value);
  return /^\d+$/.test(value) && Number.isSafeInteger(number) && number >= 1 ? number : null;
}

/** คำค้นที่สั้นเกินไม่ถูกใช้ค้น และได้ queryError กลับไปแสดง (ORD-003) */
export function parseListParams(raw: RawSearchParams): ListParams & { queryError: string | null } {
  const status = first(raw.status);
  const q = first(raw.q).trim();
  const tooShort = q !== "" && q.length < MIN_QUERY_LENGTH;
  return {
    status: Object.hasOwn(ORDER_STATUS, status) ? (status as StatusKey) : null,
    q: tooShort ? "" : q,
    page: positiveInt(first(raw.page)) ?? 1,
    asOf: positiveInt(first(raw.asOf)),
    queryError: tooShort ? QUERY_TOO_SHORT : null,
  };
}

function listQuery(params: Partial<ListParams>): string {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.q) query.set("q", params.q);
  if (params.page && params.page > 1) query.set("page", String(params.page));
  if (params.asOf) query.set("asOf", String(params.asOf));
  const text = query.toString();
  return text ? `?${text}` : "";
}

/** หน้ารายการคำสั่งซื้อของร้าน ค่าที่ไม่ใส่ใช้ค่าเริ่มต้น */
export function ordersHref(params: Partial<ListParams> = {}): string {
  return `/seller/orders${listQuery(params)}`;
}

/** หน้ารายละเอียดพกค่าของหน้ารายการไปด้วย ปุ่มกลับจึงพากลับตัวกรองเดิม */
export function orderHref(orderNo: string, params: Partial<ListParams> = {}): string {
  return `/seller/orders/${encodeURIComponent(orderNo)}${listQuery(params)}`;
}

/** หน้าติดตามพัสดุ ผู้ขายเห็นประวัติการจัดส่งพร้อมปุ่มเปลี่ยนสถานะขั้นถัดไป (ORD-009 DLV-010) */
export function trackingHref(trackingNo: string): string {
  return `/track/${encodeURIComponent(trackingNo)}`;
}
