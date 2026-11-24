import type { Db } from "@/shared/db";
import { PARCEL_STATUS, type ParcelStatus } from "@/shared/statuses";

export type HistoryEntry = { status: ParcelStatus; at: string; location: string; byAccountId?: number };

/**
 * เขียนพัสดุพร้อมประวัติการจัดส่งลงฐานข้อมูลตรงๆ สำหรับ test เท่านั้น
 * ข้ามกฎการเปลี่ยนสถานะ และไม่เปลี่ยนสถานะคำสั่งซื้อ สถานะของพัสดุคือรายการสุดท้ายของ history
 */
export function writeParcel(
  db: Db,
  input: { orderId: number; trackingNo: string; history: HistoryEntry[]; receiverName?: string; failureReason?: string },
): { id: number } {
  const first = input.history[0];
  const last = input.history.at(-1);
  if (!first || !last) throw new Error("พัสดุต้องมีประวัติอย่างน้อย 1 รายการ");
  const delivered = input.history.find((entry) => entry.status === PARCEL_STATUS.delivered);

  const inserted = db
    .prepare(
      `INSERT INTO parcels (order_id, tracking_no, status, origin_sender_name, origin_phone, origin_address,
         origin_subdistrict, origin_district, origin_province, origin_postcode,
         receiver_name, failure_reason, delivered_at, created_at, updated_at)
       SELECT o.id, ?, ?, s.origin_sender_name, s.origin_phone, s.origin_address,
         s.origin_subdistrict, s.origin_district, s.origin_province, s.origin_postcode, ?, ?, ?, ?, ?
       FROM orders o JOIN shops s ON s.id = o.shop_id WHERE o.id = ?`,
    )
    .run(
      input.trackingNo,
      last.status,
      input.receiverName ?? null,
      input.failureReason ?? null,
      delivered?.at ?? null,
      first.at,
      last.at,
      input.orderId,
    );
  if (inserted.changes === 0) throw new Error(`ไม่มีคำสั่งซื้อ ${input.orderId}`);
  const id = Number(inserted.lastInsertRowid);

  const addHistory = db.prepare(
    "INSERT INTO parcel_history (parcel_id, status, location, changed_by_account_id, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  for (const entry of input.history) addHistory.run(id, entry.status, entry.location, entry.byAccountId ?? null, entry.at);
  return { id };
}
