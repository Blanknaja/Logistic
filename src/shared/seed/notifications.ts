import { getCheckout, placeOrder } from "@/features/checkout/server/checkout";
import { CANCEL_REASON, cancelAwaitingPaymentGroup, PAYMENT_WINDOW_MS } from "@/features/checkout/server/order-groups";
import { changeParcelStatus } from "@/features/delivery/server/parcel-status";
import { confirmReceipt } from "@/features/delivery/server/receipt";
import { payByCard } from "@/features/payment/server/payments";
import { createSimulator } from "@/features/payment/server/simulator";
import type { Db } from "@/shared/db";
import { addCartItem } from "@/shared/db/builders";
import { PARCEL_STATUS, PRODUCT_STATUS, type ParcelStatus } from "@/shared/statuses";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const S = PARCEL_STATUS;
const STEPS: ParcelStatus[] = [S.awaitingPacking, S.handedOver, S.inTransit, S.outForDelivery, S.delivered];
const CARD = { number: "4242424242424242", name: "SAMPLE BUYER", expiry: "12/30", securityCode: "123" };
/** บัตรทดลองที่ถูกปฏิเสธเพราะวงเงินไม่พอ */
const DECLINED_CARD = { ...CARD, number: "4111111111140011" };

/** จำนวนแจ้งเตือนล่าสุดของแต่ละบัญชีที่ยังไม่อ่าน (NTF-018) */
const UNREAD_PER_ACCOUNT = 3;

type Shop = { ownerId: number; shopId: number; province: string };

type Flow = {
  /** ลำดับของผู้ซื้อตัวอย่าง 0 คือ buyer1 */
  buyer: number;
  shop: Shop;
  lines: [variantId: number, quantity: number][];
  hoursAgo: number;
  /** จ่ายด้วยบัตรที่ถูกปฏิเสธก่อนจ่ายสำเร็จ */
  declinedFirst?: boolean;
  /** ไม่จ่ายจนหมดเวลา หรือสถานะการจัดส่งที่ไปถึง */
  end: "expired" | ParcelStatus | "received";
};

/**
 * NTF-018 แจ้งเตือนตัวอย่างของ buyer1 ถึง buyer3 และ seller01
 * แจ้งเตือนเกิดจากกฎจริงของการสั่งซื้อ จ่ายเงิน และจัดส่ง ทุกรายการจึงตรงกับคำสั่งซื้อ พัสดุ และสต็อกที่มีอยู่จริง
 * คำสั่งซื้อตัวอย่างของ orders.ts ให้แจ้งเตือนชุดแรกแล้ว ไฟล์นี้เพิ่มเหตุการณ์ที่ชุดนั้นไม่มี คือจ่ายไม่สำเร็จ หมดเวลาจ่ายเงิน และสต็อกเหลือ 0
 * และเพิ่มจำนวนให้ buyer1 มีหน้า 2 แล้วเหลือรายการล่าสุดของแต่ละบัญชีไว้ยังไม่อ่าน
 */
export async function addSampleNotifications(db: Db, now: number): Promise<void> {
  const shopOf = (email: string) =>
    db
      .prepare(
        `SELECT a.id AS ownerId, s.id AS shopId, s.origin_province AS province FROM accounts a
         JOIN shops s ON s.owner_account_id = a.id WHERE a.email = ?`,
      )
      .get(email) as Shop;
  const seller01 = shopOf("seller01@example.com");
  const seller02 = shopOf("seller02@example.com");
  const buyers = db
    .prepare(
      `SELECT a.id, d.id AS addressId, d.province FROM accounts a JOIN shipping_addresses d ON d.account_id = a.id AND d.is_default = 1
       WHERE a.email LIKE 'buyer%@example.com' ORDER BY a.id`,
    )
    .all() as { id: number; addressId: number; province: string }[];
  const plain = db
    .prepare(
      `SELECT v.id FROM variants v JOIN products p ON p.id = v.product_id
       WHERE p.shop_id = ? AND p.status = ? AND v.price IS NOT NULL AND v.stock >= 10 ORDER BY v.id LIMIT 1`,
    )
    .get(seller02.shopId, PRODUCT_STATUS.onSale) as { id: number };
  const nearlyOut = db
    .prepare(
      `SELECT v.id, v.stock FROM variants v JOIN products p ON p.id = v.product_id
       WHERE p.shop_id = ? AND p.status = ? AND p.model_url IS NULL AND v.price IS NOT NULL AND v.stock BETWEEN 1 AND 5
       ORDER BY v.stock, v.id LIMIT 2`,
    )
    .all(seller01.shopId, PRODUCT_STATUS.onSale) as { id: number; stock: number }[];
  if (nearlyOut.length < 2) throw new Error("ร้าน seller01 ต้องมีแบบย่อยที่สต็อก 1 ถึง 5 ชิ้นอย่างน้อย 2 แบบ");

  const provider = createSimulator();
  const flows: Flow[] = [
    { buyer: 0, shop: seller02, lines: [[plain.id, 1]], hoursAgo: 12, end: "expired" },
    { buyer: 0, shop: seller02, lines: [[plain.id, 1]], hoursAgo: 10, declinedFirst: true, end: "received" },
    { buyer: 1, shop: seller01, lines: nearlyOut.map((variant) => [variant.id, variant.stock]), hoursAgo: 8, declinedFirst: true, end: S.awaitingPacking },
    { buyer: 2, shop: seller02, lines: [[plain.id, 1]], hoursAgo: 6, declinedFirst: true, end: S.outForDelivery },
    { buyer: 0, shop: seller02, lines: [[plain.id, 2]], hoursAgo: 4, end: "received" },
  ];

  for (const flow of flows) {
    const buyer = buyers[flow.buyer];
    let at = now - flow.hoursAgo * HOUR;
    const after = (minutes: number) => new Date((at += minutes * MINUTE));

    for (const [variantId, quantity] of flow.lines) addCartItem(db, { accountId: buyer.id, variantId, quantity });
    // กุญแจกันสั่งซ้ำ (CHK-007) คิดจากเวลาที่ใส่ตะกร้า คำสั่งซื้อตัวอย่างแต่ละรายการจึงต้องได้เวลาของตัวเอง
    db.prepare("UPDATE cart_items SET added_at = ? WHERE account_id = ?").run(new Date(at).toISOString(), buyer.id);
    const checkout = getCheckout(db, buyer.id);
    const lines = checkout.shops.flatMap((shop) =>
      shop.lines.map((line) => ({ cartItemId: line.cartItemId, quantity: line.quantity, unitPrice: line.unitPrice ?? 0 })),
    );
    const placedAt = after(0);
    const placed = placeOrder(db, { buyerAccountId: buyer.id, addressId: buyer.addressId, orderKey: checkout.orderKey, lines }, placedAt);
    if (!placed.ok || placed.duplicate) throw new Error(`สร้างคำสั่งซื้อตัวอย่างไม่ได้ ${JSON.stringify(placed)}`);

    if (flow.end === "expired") {
      cancelAwaitingPaymentGroup(db, placed.groupId, CANCEL_REASON.paymentTimeout, new Date(placedAt.getTime() + PAYMENT_WINDOW_MS));
      continue;
    }
    if (flow.declinedFirst) await payByCard(db, provider, { buyerId: buyer.id, groupId: placed.groupId, card: DECLINED_CARD }, after(5));
    await payByCard(db, provider, { buyerId: buyer.id, groupId: placed.groupId, card: CARD }, after(5));

    const parcel = db.prepare("SELECT p.tracking_no FROM parcels p JOIN orders o ON o.id = p.order_id WHERE o.group_id = ?").get(placed.groupId) as {
      tracking_no: string;
    };
    const target = flow.end === "received" ? S.delivered : flow.end;
    for (let step = 1; step <= STEPS.indexOf(target); step++) {
      const province = step === 1 ? flow.shop.province : buyer.province;
      const result = changeParcelStatus(
        db,
        {
          trackingNo: parcel.tracking_no,
          actor: { id: flow.shop.ownerId, isAdmin: false, shopId: flow.shop.shopId },
          from: STEPS[step - 1],
          to: STEPS[step],
          location: step === 1 ? "ไปรษณีย์ใกล้ร้าน" : "ศูนย์กระจายสินค้าปลายทาง",
          province,
          receiverName: "ผู้ซื้อตัวอย่าง",
        },
        after(20),
      );
      if (!result.ok) throw new Error(`เปลี่ยนสถานะพัสดุตัวอย่างไม่ได้ ${JSON.stringify(result)}`);
    }
    if (flow.end === "received") confirmReceipt(db, parcel.tracking_no, { id: buyer.id, isAdmin: false, shopId: null }, after(20));
  }

  db.prepare(
    `UPDATE notifications SET read_at = created_at WHERE id NOT IN (
       SELECT id FROM (SELECT id, row_number() OVER (PARTITION BY account_id ORDER BY created_at DESC, id DESC) AS position FROM notifications)
       WHERE position <= ?
     )`,
  ).run(UNREAD_PER_ACCOUNT);
}
