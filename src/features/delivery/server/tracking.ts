import type { CurrentAccount } from "@/features/account/server/sessions";
import type { Db } from "@/shared/db";
import {
  ORDER_STATUS,
  PARCEL_STATUS,
  type OrderStatus,
  type ParcelStatus,
  type ReceiptConfirmedBy,
} from "@/shared/statuses";
import { deliveryRoute, type DeliveryRoute } from "./route";

export const PARCEL_NOT_FOUND = "ไม่พบพัสดุนี้";
export const TRACKING_NO_FORMAT_ERROR = "เลขติดตามพัสดุต้องเป็น BS ตามด้วยตัวเลข 10 หลัก";

/** ผู้ซื้อไม่กดยืนยันภายในเท่านี้หลังพัสดุเป็น ส่งสำเร็จ ระบบยืนยันให้ (DLV-013) */
export const AUTO_CONFIRM_AFTER_MS = 168 * 60 * 60 * 1000;

export type Viewer = Pick<CurrentAccount, "id" | "isAdmin" | "shopId">;

export type TrackingHistoryEntry = {
  status: ParcelStatus;
  at: string;
  location: string;
  /** ว่างในรายการที่บันทึกก่อนมีช่องจังหวัด (MAP-007) */
  province: string | null;
  receiverName: string | null;
  failureReason: string | null;
  /** ชื่อบัญชีที่เปลี่ยน เฉพาะผู้ขายและผู้ดูแลแพลตฟอร์มเห็น */
  changedBy: string | null;
};

export type TrackingView = {
  trackingNo: string;
  shopName: string;
  parcelStatus: ParcelStatus;
  orderStatus: OrderStatus;
  /** ที่อยู่ต้นทาง เฉพาะผู้ขายเจ้าของร้านและผู้ดูแลแพลตฟอร์มเห็น */
  origin: {
    senderName: string;
    phone: string;
    address: string;
    subdistrict: string;
    district: string;
    province: string;
    postcode: string;
  } | null;
  canChangeStatus: boolean;
  canConfirmReceipt: boolean;
  receipt: { by: ReceiptConfirmedBy; at: string } | null;
  /** วันที่ระบบจะยืนยันรับสินค้าให้ ถ้ายังรอผู้ซื้อกดอยู่ */
  autoConfirmAt: string | null;
  history: TrackingHistoryEntry[];
  /** เส้นทางระดับจังหวัดของแผนที่การจัดส่งและข้อความเส้นทาง */
  route: DeliveryRoute;
};

/** " bs0000000123 " → "BS0000000123" หรือ null ถ้ารูปแบบผิด */
export function parseTrackingNo(input: string): string | null {
  const value = input.trim().toUpperCase();
  return /^BS[0-9]{10}$/.test(value) ? value : null;
}

type ParcelRow = {
  id: number;
  order_id: number;
  tracking_no: string;
  status: ParcelStatus;
  origin_sender_name: string;
  origin_phone: string;
  origin_address: string;
  origin_subdistrict: string;
  origin_district: string;
  origin_province: string;
  origin_postcode: string;
  receiver_name: string | null;
  failure_reason: string | null;
  delivered_at: string | null;
  receipt_confirmed_at: string | null;
  receipt_confirmed_by: ReceiptConfirmedBy | null;
  order_status: OrderStatus;
  buyer_account_id: number;
  ship_province: string;
  shop_id: number;
  shop_name: string;
};

export type ViewableParcel = { row: ParcelRow; isBuyer: boolean; isStaff: boolean };

/** พัสดุที่บัญชีนี้ดูได้ หรือ null ถ้าไม่มีพัสดุเลขนั้นหรือไม่มีสิทธิ์ดู ทั้งสองกรณีตอบเหมือนกัน */
export function findViewableParcel(db: Db, trackingNo: string, viewer: Viewer): ViewableParcel | null {
  const parsed = parseTrackingNo(trackingNo);
  if (!parsed) return null;
  const row = db
    .prepare(
      `SELECT p.*, o.status AS order_status, o.buyer_account_id, o.ship_province, o.shop_id, s.name AS shop_name
       FROM parcels p
       JOIN orders o ON o.id = p.order_id
       JOIN shops s ON s.id = o.shop_id
       WHERE p.tracking_no = ?`,
    )
    .get(parsed) as ParcelRow | undefined;
  if (!row) return null;
  const isBuyer = row.buyer_account_id === viewer.id;
  const isStaff = viewer.isAdmin || viewer.shopId === row.shop_id;
  return isBuyer || isStaff ? { row, isBuyer, isStaff } : null;
}

export function getTrackingView(db: Db, trackingNo: string, viewer: Viewer): TrackingView | null {
  const found = findViewableParcel(db, trackingNo, viewer);
  if (!found) return null;
  const { row, isBuyer, isStaff } = found;

  const history = (
    db
      .prepare(
        `SELECT h.status, h.location, h.province, h.created_at, a.display_name AS changed_by
         FROM parcel_history h
         LEFT JOIN accounts a ON a.id = h.changed_by_account_id
         WHERE h.parcel_id = ?
         ORDER BY h.created_at DESC, h.id DESC`,
      )
      .all(row.id) as {
      status: ParcelStatus;
      location: string;
      province: string | null;
      created_at: string;
      changed_by: string | null;
    }[]
  ).map((entry) => ({
    status: entry.status,
    at: entry.created_at,
    location: entry.location,
    province: entry.province,
    // ส่งสำเร็จ และ ส่งไม่สำเร็จ เป็นสถานะปลายทาง จึงมีได้รายการเดียวต่อพัสดุ
    receiverName: entry.status === PARCEL_STATUS.delivered ? row.receiver_name : null,
    failureReason: entry.status === PARCEL_STATUS.failed ? row.failure_reason : null,
    changedBy: isStaff ? entry.changed_by : null,
  }));

  const awaitingReceipt = row.status === PARCEL_STATUS.delivered && row.order_status === ORDER_STATUS.shipping;
  return {
    trackingNo: row.tracking_no,
    shopName: row.shop_name,
    parcelStatus: row.status,
    orderStatus: row.order_status,
    origin: isStaff
      ? {
          senderName: row.origin_sender_name,
          phone: row.origin_phone,
          address: row.origin_address,
          subdistrict: row.origin_subdistrict,
          district: row.origin_district,
          province: row.origin_province,
          postcode: row.origin_postcode,
        }
      : null,
    canChangeStatus: isStaff,
    canConfirmReceipt: isBuyer && awaitingReceipt,
    receipt:
      row.receipt_confirmed_at && row.receipt_confirmed_by
        ? { by: row.receipt_confirmed_by, at: row.receipt_confirmed_at }
        : null,
    autoConfirmAt:
      awaitingReceipt && row.delivered_at
        ? new Date(new Date(row.delivered_at).getTime() + AUTO_CONFIRM_AFTER_MS).toISOString()
        : null,
    history,
    route: deliveryRoute({
      origin: row.origin_province,
      history: history.map((entry) => entry.province).reverse(),
      destination: row.ship_province,
      status: row.status,
    }),
  };
}

/** ผลการค้นหาพัสดุ (DLV-011) ไม่มีพัสดุเลขนั้นกับไม่มีสิทธิ์ดูได้ข้อความเดียวกัน */
export function searchParcel(
  db: Db,
  input: string,
  viewer: Viewer,
): { ok: true; trackingNo: string } | { ok: false; error: string } {
  if (!parseTrackingNo(input)) return { ok: false, error: TRACKING_NO_FORMAT_ERROR };
  const found = findViewableParcel(db, input, viewer);
  return found ? { ok: true, trackingNo: found.row.tracking_no } : { ok: false, error: PARCEL_NOT_FOUND };
}
