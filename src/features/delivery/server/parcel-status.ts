import { randomInt } from "node:crypto";
import type { CurrentAccount } from "@/features/account/server/sessions";
import { notifyParcelStatusChanged } from "@/features/notification/server/events";
import { releaseCancelledOrderStock } from "@/features/stock/server/reservation";
import { transaction, type Db } from "@/shared/db";
import { PROVINCES } from "@/shared/provinces";
import { ORDER_STATUS, PARCEL_STATUS, type OrderStatus, type ParcelStatus } from "@/shared/statuses";

export const NOT_ALLOWED = "คุณไม่มีสิทธิ์เปลี่ยนสถานะการจัดส่งของพัสดุนี้";
export const ONE_STEP = "เปลี่ยนสถานะได้ทีละขั้น และย้อนกลับไม่ได้";
export const FINISHED = "พัสดุนี้จบการจัดส่งแล้ว เปลี่ยนสถานะไม่ได้";
export const ORDER_CANCELLED = "คำสั่งซื้อนี้ถูกยกเลิกแล้ว เปลี่ยนสถานะการจัดส่งไม่ได้";
export const STALE = "สถานะถูกเปลี่ยนไปแล้ว";
export const LOCATION_ERROR = "กรอกสถานที่ 1 ถึง 100 ตัวอักษร";
export const RECEIVER_ERROR = "กรอกชื่อผู้รับ 1 ถึง 100 ตัวอักษร";
export const REASON_ERROR = "กรอกเหตุผล 1 ถึง 200 ตัวอักษร";
export const PROVINCE_ERROR = "เลือกจังหวัด";

const S = PARCEL_STATUS;

/** ขั้นถัดไปที่เปลี่ยนได้ ตามตารางใน delivery.md ส่วนที่ 5 */
const NEXT: Record<ParcelStatus, ParcelStatus[]> = {
  [S.awaitingPacking]: [S.handedOver],
  [S.handedOver]: [S.inTransit],
  [S.inTransit]: [S.outForDelivery],
  [S.outForDelivery]: [S.delivered, S.failed],
  [S.delivered]: [],
  [S.failed]: [],
};

/** คนที่ขอเปลี่ยนสถานะ ส่ง CurrentAccount ของหน้าเข้ามาได้เลย */
export type StatusChanger = Pick<CurrentAccount, "id" | "isAdmin" | "shopId">;

/** DLV-002 ผู้ขายเจ้าของร้านของพัสดุ หรือผู้ดูแลแพลตฟอร์ม */
const canChange = (actor: StatusChanger, shopId: number) => actor.isAdmin || actor.shopId === shopId;

/** นับเป็นตัวอักษร ไม่ใช่หน่วยของ JavaScript */
const length = (text: string) => [...text].length;

function newTrackingNo(db: Db): string {
  const exists = db.prepare("SELECT 1 FROM parcels WHERE tracking_no = ?");
  for (;;) {
    const trackingNo = `BS${String(randomInt(10_000_000_000)).padStart(10, "0")}`;
    if (!exists.get(trackingNo)) return trackingNo;
  }
}

/**
 * DLV-001 สร้างพัสดุของคำสั่งซื้อที่เพิ่งเป็น `จ่ายแล้ว` เรียกซ้ำได้ ครั้งต่อไปคืนพัสดุชิ้นเดิม
 * การจ่ายเงิน (#15) เรียกฟังก์ชันนี้กับทุกคำสั่งซื้อในกลุ่ม ใน transaction เดียวกับที่เปลี่ยนเป็น `จ่ายแล้ว`
 */
export function createParcelForPaidOrder(
  db: Db,
  orderId: number,
  now: Date = new Date(),
): { id: number; trackingNo: string } {
  return transaction(db, () => {
    const existing = db.prepare("SELECT id, tracking_no FROM parcels WHERE order_id = ?").get(orderId) as
      | { id: number; tracking_no: string }
      | undefined;
    if (existing) return { id: existing.id, trackingNo: existing.tracking_no };

    const order = db
      .prepare(
        `SELECT o.status, s.name, s.origin_sender_name, s.origin_phone, s.origin_address, s.origin_subdistrict,
                s.origin_district, s.origin_province, s.origin_postcode
         FROM orders o JOIN shops s ON s.id = o.shop_id WHERE o.id = ?`,
      )
      .get(orderId) as Record<string, string> | undefined;
    if (!order) throw new Error(`ไม่มีคำสั่งซื้อ ${orderId}`);
    if (order.status !== ORDER_STATUS.paid) {
      throw new Error(`คำสั่งซื้อ ${orderId} เป็น ${order.status} สร้างพัสดุได้เฉพาะคำสั่งซื้อที่ ${ORDER_STATUS.paid}`);
    }

    const at = now.toISOString();
    const trackingNo = newTrackingNo(db);
    const id = Number(
      db
        .prepare(
          `INSERT INTO parcels (order_id, tracking_no, status, origin_sender_name, origin_phone, origin_address,
             origin_subdistrict, origin_district, origin_province, origin_postcode, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          orderId,
          trackingNo,
          S.awaitingPacking,
          order.origin_sender_name,
          order.origin_phone,
          order.origin_address,
          order.origin_subdistrict,
          order.origin_district,
          order.origin_province,
          order.origin_postcode,
          at,
          at,
        ).lastInsertRowid,
    );
    db.prepare("INSERT INTO parcel_history (parcel_id, status, location, province, created_at) VALUES (?, ?, ?, ?, ?)").run(
      id,
      S.awaitingPacking,
      order.name,
      order.origin_province,
      at,
    );
    return { id, trackingNo };
  });
}

type ParcelRow = {
  id: number;
  tracking_no: string;
  status: ParcelStatus;
  order_id: number;
  order_no: string;
  order_status: OrderStatus;
  shop_id: number;
  shop_name: string;
  origin_province: string;
};

function findParcel(db: Db, trackingNo: string): ParcelRow | undefined {
  return db
    .prepare(
      `SELECT p.id, p.tracking_no, p.status, p.origin_province, o.id AS order_id, o.order_no, o.status AS order_status,
              s.id AS shop_id, s.name AS shop_name
       FROM parcels p JOIN orders o ON o.id = p.order_id JOIN shops s ON s.id = o.shop_id
       WHERE p.tracking_no = ?`,
    )
    .get(trackingNo) as ParcelRow | undefined;
}

export type ParcelForStatusChange = {
  trackingNo: string;
  status: ParcelStatus;
  shopName: string;
  orderNo: string;
  orderStatus: OrderStatus;
  /** ปุ่ม "เปลี่ยนเป็น ..." ที่ควรแสดง ว่างเมื่อจบการจัดส่งแล้วหรือคำสั่งซื้อถูกยกเลิก */
  nextStatuses: ParcelStatus[];
  latest: { status: ParcelStatus; at: string; location: string };
  /** MAP-002 จังหวัดของรายการล่าสุดที่มีจังหวัด หรือจังหวัดของที่อยู่ต้นทางของพัสดุ */
  defaultProvince: string;
};

/**
 * ข้อมูลของหน้าเปลี่ยนสถานะ คืน null ถ้าไม่มีพัสดุนี้ หรือ viewer ไม่มีสิทธิ์เปลี่ยน
 * หน้าติดตามพัสดุใช้ผลที่ไม่เป็น null เพื่อรู้ว่าต้องแสดงปุ่มเปลี่ยนสถานะ
 */
export function getParcelForStatusChange(
  db: Db,
  trackingNo: string,
  viewer: StatusChanger,
): ParcelForStatusChange | null {
  const parcel = findParcel(db, trackingNo);
  if (!parcel || !canChange(viewer, parcel.shop_id)) return null;
  const latest = db
    .prepare(
      "SELECT status, created_at AS at, location FROM parcel_history WHERE parcel_id = ? ORDER BY id DESC LIMIT 1",
    )
    .get(parcel.id) as ParcelForStatusChange["latest"];
  const lastProvince = db
    .prepare("SELECT province FROM parcel_history WHERE parcel_id = ? AND province IS NOT NULL ORDER BY id DESC LIMIT 1")
    .get(parcel.id) as { province: string } | undefined;
  return {
    trackingNo: parcel.tracking_no,
    status: parcel.status,
    shopName: parcel.shop_name,
    orderNo: parcel.order_no,
    orderStatus: parcel.order_status,
    nextStatuses: parcel.order_status === ORDER_STATUS.cancelled ? [] : NEXT[parcel.status],
    latest,
    defaultProvince: lastProvince?.province ?? parcel.origin_province,
  };
}

export type StatusChangeErrors = { location?: string; province?: string; receiverName?: string; reason?: string };

/** สิ่งที่หน้าต้องแสดงเมื่อบันทึกไม่ได้ */
export type StatusChangeProblem = { error?: string; currentStatus?: ParcelStatus; fieldErrors?: StatusChangeErrors };

export type StatusChangeResult = { ok: true } | ({ ok: false } & StatusChangeProblem);

export type StatusChangeInput = {
  trackingNo: string;
  actor: StatusChanger;
  /** สถานะที่หน้าของคนเปลี่ยนแสดงอยู่ตอนกดบันทึก (DLV-008) */
  from: string;
  to: string;
  location: string;
  /** MAP-001 ชื่อจังหวัดจาก PROVINCES */
  province: string;
  receiverName?: string;
  reason?: string;
};

/** DLV-002 ถึง DLV-009 เปลี่ยนสถานะการจัดส่งหนึ่งขั้น พร้อมสถานะคำสั่งซื้อที่ต้องเปลี่ยนตาม ในการบันทึกเดียว */
export function changeParcelStatus(db: Db, input: StatusChangeInput, now: Date = new Date()): StatusChangeResult {
  return transaction(db, () => {
    const parcel = findParcel(db, input.trackingNo);
    if (!parcel || !canChange(input.actor, parcel.shop_id)) return { ok: false, error: NOT_ALLOWED };
    // ตรวจก่อนสถานะปลายทาง คนที่กดจากหน้าเก่าจึงได้รู้สถานะล่าสุด
    if (input.from !== parcel.status) return { ok: false, error: STALE, currentStatus: parcel.status };
    if (NEXT[parcel.status].length === 0) return { ok: false, error: FINISHED };
    if (parcel.order_status === ORDER_STATUS.cancelled) return { ok: false, error: ORDER_CANCELLED };
    const to = NEXT[parcel.status].find((status) => status === input.to);
    if (!to) return { ok: false, error: ONE_STEP, currentStatus: parcel.status };

    const location = input.location.trim();
    const receiverName = to === S.delivered ? (input.receiverName ?? "").trim() : null;
    const reason = to === S.failed ? (input.reason ?? "").trim() : null;
    const fieldErrors: StatusChangeErrors = {};
    if (length(location) < 1 || length(location) > 100) fieldErrors.location = LOCATION_ERROR;
    if (!(PROVINCES as readonly string[]).includes(input.province)) fieldErrors.province = PROVINCE_ERROR;
    if (receiverName !== null && (length(receiverName) < 1 || length(receiverName) > 100)) {
      fieldErrors.receiverName = RECEIVER_ERROR;
    }
    if (reason !== null && (length(reason) < 1 || length(reason) > 200)) fieldErrors.reason = REASON_ERROR;
    if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

    const at = now.toISOString();
    db.prepare(
      `UPDATE parcels SET status = ?, receiver_name = coalesce(?, receiver_name), failure_reason = coalesce(?, failure_reason),
         delivered_at = CASE WHEN ? THEN ? ELSE delivered_at END, updated_at = ?
       WHERE id = ?`,
    ).run(to, receiverName, reason, to === S.delivered ? 1 : 0, at, at, parcel.id);
    db.prepare(
      "INSERT INTO parcel_history (parcel_id, status, location, province, changed_by_account_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(parcel.id, to, location, input.province, input.actor.id, at);

    if (to === S.handedOver) {
      db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(ORDER_STATUS.shipping, parcel.order_id);
    }
    if (to === S.failed) cancelOrderOfFailedParcel(db, parcel.order_id, now);
    notifyParcelStatusChanged(db, parcel.tracking_no, to, now);
    return { ok: true };
  });
}

/** DLV-006 คำสั่งซื้อของพัสดุที่ส่งไม่สำเร็จเป็น `ยกเลิก` เหตุผล "ส่งไม่สำเร็จ" (CHK-010) แล้วคืนสต็อก (INV-013) */
function cancelOrderOfFailedParcel(db: Db, orderId: number, now: Date): void {
  db.prepare("UPDATE orders SET status = ?, cancelled_at = ?, cancel_reason = ? WHERE id = ?").run(
    ORDER_STATUS.cancelled,
    now.toISOString(),
    S.failed,
    orderId,
  );
  releaseCancelledOrderStock(db, orderId, now);
}
