import { cancelOrderGroup } from "@/features/checkout/server/buyer-orders";
import { getCheckout, placeOrder } from "@/features/checkout/server/checkout";
import { changeParcelStatus } from "@/features/delivery/server/parcel-status";
import { confirmReceipt } from "@/features/delivery/server/receipt";
import { payByCard } from "@/features/payment/server/payments";
import { createSimulator } from "@/features/payment/server/simulator";
import type { Db } from "@/shared/db";
import { addAddress, addCartItem } from "@/shared/db/builders";
import { PARCEL_STATUS, PRODUCT_STATUS, type ParcelStatus } from "@/shared/statuses";

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const S = PARCEL_STATUS;

/**
 * สถานะการจัดส่งที่คำสั่งซื้อตัวอย่างไปถึง กับลำดับของผู้ซื้อ (0 คือ buyer1)
 * null คือผู้ซื้อยกเลิกก่อนจ่าย received คือผู้ซื้อกด "ได้รับสินค้าแล้ว"
 */
const STORIES: [ParcelStatus | "received" | null, number][] = [
  ["received", 0],
  ["received", 1],
  [S.failed, 0],
  [null, 0],
  [S.delivered, 0],
  [S.inTransit, 1],
  [S.awaitingPacking, 0],
  [S.awaitingPacking, 2],
];

const STEPS: ParcelStatus[] = [S.awaitingPacking, S.handedOver, S.inTransit, S.outForDelivery];

/**
 * คำสั่งซื้อตัวอย่างของร้าน seller01 จากผู้ซื้อตัวอย่าง ครบทุกสถานะ ผ่านกฎจริงของการสั่งซื้อ จ่ายเงิน และจัดส่ง
 * สต็อก ประวัติ การจ่ายเงิน และพัสดุจึงตรงกันเหมือนคนกดเอง ไม่มีคำสั่งซื้อที่รอจ่ายเงินเพราะจะหมดเวลาใน 30 นาที
 */
export async function addSampleOrders(db: Db, now: number): Promise<void> {
  const seller = db
    .prepare("SELECT a.id, s.id AS shop_id FROM accounts a JOIN shops s ON s.owner_account_id = a.id WHERE a.email = 'seller01@example.com'")
    .get() as { id: number; shop_id: number };
  const buyers = (db.prepare("SELECT id FROM accounts WHERE email LIKE 'buyer%@example.com' ORDER BY id").all() as { id: number }[]).map(
    (row) => row.id,
  );
  const variants = (
    db
      .prepare(
        `SELECT v.id FROM variants v JOIN products p ON p.id = v.product_id
         WHERE p.shop_id = ? AND p.status = ? AND v.price IS NOT NULL AND v.stock >= 5 ORDER BY v.id LIMIT 4`,
      )
      .all(seller.shop_id, PRODUCT_STATUS.onSale) as { id: number }[]
  ).map((row) => row.id);
  const sellerActor = { id: seller.id, isAdmin: false, shopId: seller.shop_id };
  const provider = createSimulator();
  for (const buyerId of buyers) addAddress(db, { accountId: buyerId, isDefault: true });

  for (const [i, [story, buyer]] of STORIES.entries()) {
    const buyerId = buyers[buyer];
    let at = now - (STORIES.length - i) * DAY;
    const tick = () => new Date((at += 20 * MINUTE));

    addCartItem(db, { accountId: buyerId, variantId: variants[i % variants.length], quantity: 1 + (i % 2) });
    const checkout = getCheckout(db, buyerId);
    const lines = checkout.shops.flatMap((shop) =>
      shop.lines.map((line) => ({ cartItemId: line.cartItemId, quantity: line.quantity, unitPrice: line.unitPrice ?? 0 })),
    );
    const placed = placeOrder(db, { buyerAccountId: buyerId, addressId: checkout.addresses[0].id, orderKey: checkout.orderKey, lines }, tick());
    if (!placed.ok) throw new Error(`สร้างคำสั่งซื้อตัวอย่างไม่ได้ ${JSON.stringify(placed)}`);
    const order = db.prepare("SELECT o.order_no FROM orders o WHERE o.group_id = ?").get(placed.groupId) as { order_no: string };

    if (story === null) {
      cancelOrderGroup(db, { buyerAccountId: buyerId, orderNo: order.order_no }, tick());
      continue;
    }
    const card = { number: "4242424242424242", name: "SAMPLE BUYER", expiry: "12/30", securityCode: "123" };
    await payByCard(db, provider, { buyerId, groupId: placed.groupId, card }, tick());

    const parcel = db.prepare("SELECT p.tracking_no FROM parcels p JOIN orders o ON o.id = p.order_id WHERE o.group_id = ?").get(placed.groupId) as {
      tracking_no: string;
    };
    const target = story === "received" ? S.delivered : story;
    const path = target === S.delivered || target === S.failed ? [...STEPS, target] : STEPS.slice(0, STEPS.indexOf(target) + 1);
    for (let step = 1; step < path.length; step++) {
      const result = changeParcelStatus(
        db,
        {
          trackingNo: parcel.tracking_no,
          actor: sellerActor,
          from: path[step - 1],
          to: path[step],
          location: step === 1 ? "ไปรษณีย์ใกล้ร้าน" : "ศูนย์กระจายสินค้าปลายทาง",
          receiverName: "ผู้ซื้อตัวอย่าง",
          reason: "ไม่มีคนรับ โทรไม่ติด",
        },
        tick(),
      );
      if (!result.ok) throw new Error(`เปลี่ยนสถานะพัสดุตัวอย่างไม่ได้ ${JSON.stringify(result)}`);
    }
    if (story === "received") confirmReceipt(db, parcel.tracking_no, { id: buyerId, isAdmin: false, shopId: null }, tick());
  }
}
