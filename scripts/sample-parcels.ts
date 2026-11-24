// pnpm tsx scripts/sample-parcels.ts
// เขียนพัสดุตัวอย่าง 4 ชิ้นของ buyer1@example.com จากร้านของ seller01@example.com ลงฐานข้อมูลของเครื่องนี้
// ไว้ลองหน้าติดตามพัสดุ /track/<เลข> ก่อนที่การจ่ายเงินและการเปลี่ยนสถานะการจัดส่งจะต่อกันครบ รันหลัง pnpm seed
//   BS9000000001 รอร้านจัดของ                 คำสั่งซื้อ จ่ายแล้ว
//   BS9000000002 ส่งสำเร็จ เมื่อ 2 ชั่วโมงก่อน    คำสั่งซื้อ กำลังจัดส่ง  ลองกด "ได้รับสินค้าแล้ว"
//   BS9000000003 ส่งสำเร็จ เมื่อ 8 วันก่อน       คำสั่งซื้อ กำลังจัดส่ง  แอปที่เปิดอยู่จะปิดเป็น สำเร็จ เองภายใน 1 นาที
//   BS9000000004 ส่งไม่สำเร็จ                   คำสั่งซื้อ ยกเลิก

import { writeParcel, type HistoryEntry } from "@/features/delivery/server/tracking-fixtures";
import { databasePath, openDb, transaction } from "@/shared/db";
import { addOrder } from "@/shared/db/builders";
import { ORDER_STATUS, PARCEL_STATUS, type OrderStatus } from "@/shared/statuses";

const HOUR = 60 * 60 * 1000;
const db = openDb(databasePath());

if (db.prepare("SELECT 1 FROM parcels WHERE tracking_no = 'BS9000000001'").get()) {
  console.log("มีพัสดุตัวอย่างอยู่แล้ว ไม่สร้างซ้ำ");
  process.exit(0);
}

const buyer = db.prepare("SELECT id FROM accounts WHERE email = 'buyer1@example.com'").get() as { id: number } | undefined;
const seller = db
  .prepare(
    `SELECT a.id AS account_id, s.name, v.id AS variant_id FROM accounts a
     JOIN shops s ON s.owner_account_id = a.id JOIN products p ON p.shop_id = s.id JOIN variants v ON v.product_id = p.id
     WHERE a.email = 'seller01@example.com' ORDER BY v.id LIMIT 1`,
  )
  .get() as { account_id: number; name: string; variant_id: number } | undefined;
if (!buyer || !seller) {
  console.error("ไม่พบบัญชีตัวอย่าง รัน pnpm seed ก่อน");
  process.exit(1);
}

const ago = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString();
const steps = (deliveredHoursAgo: number): HistoryEntry[] => [
  { status: PARCEL_STATUS.awaitingPacking, at: ago(deliveredHoursAgo + 30), location: seller.name },
  { status: PARCEL_STATUS.handedOver, at: ago(deliveredHoursAgo + 26), location: "จุดรับพัสดุบางนา", byAccountId: seller.account_id },
  { status: PARCEL_STATUS.inTransit, at: ago(deliveredHoursAgo + 20), location: "ศูนย์คัดแยกลาดกระบัง", byAccountId: seller.account_id },
  { status: PARCEL_STATUS.outForDelivery, at: ago(deliveredHoursAgo + 3), location: "ศูนย์กระจายพัสดุอ่อนนุช", byAccountId: seller.account_id },
];

const samples: { trackingNo: string; orderStatus: OrderStatus; history: HistoryEntry[]; receiverName?: string; failureReason?: string }[] = [
  { trackingNo: "BS9000000001", orderStatus: ORDER_STATUS.paid, history: [{ status: PARCEL_STATUS.awaitingPacking, at: ago(1), location: seller.name }] },
  ...[2, 8 * 24].map((hoursAgo, i) => ({
    trackingNo: `BS900000000${i + 2}`,
    orderStatus: ORDER_STATUS.shipping,
    history: [
      ...steps(hoursAgo),
      { status: PARCEL_STATUS.delivered, at: ago(hoursAgo), location: "บ้านเลขที่ 12 ซอยอ่อนนุช 17", byAccountId: seller.account_id },
    ],
    receiverName: "ผู้ซื้อตัวอย่าง 1",
  })),
  {
    trackingNo: "BS9000000004",
    orderStatus: ORDER_STATUS.cancelled,
    history: [
      ...steps(5),
      { status: PARCEL_STATUS.failed, at: ago(5), location: "หน้าบ้านผู้ซื้อ ซอยอ่อนนุช 17", byAccountId: seller.account_id },
    ],
    failureReason: "ไม่มีคนรับ โทรไม่ติด 2 ครั้ง",
  },
];

transaction(db, () => {
  for (const sample of samples) {
    const order = addOrder(db, {
      buyerAccountId: buyer.id,
      items: [{ variantId: seller.variant_id, quantity: 2 }],
      status: sample.orderStatus,
      orderedAt: sample.history[0].at,
    });
    writeParcel(db, { orderId: order.id, ...sample });
  }
});
db.close();
console.log(`สร้างพัสดุตัวอย่างแล้ว: ${samples.map((sample) => sample.trackingNo).join(" ")}`);
