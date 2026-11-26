import { hashPassword } from "@/features/account/server/password";
import { getCheckout, placeOrder } from "@/features/checkout/server/checkout";
import { changeParcelStatus } from "@/features/delivery/server/parcel-status";
import { confirmReceipt } from "@/features/delivery/server/receipt";
import { payByCard } from "@/features/payment/server/payments";
import { createSimulator } from "@/features/payment/server/simulator";
import { getImageFile, IMAGE_URL_PREFIX } from "@/features/product-listing/server/image-files";
import { saveReviewImage } from "@/features/review/server/image-files";
import { hideReview, replyToReview, submitReview } from "@/features/review/server/reviews";
import { transaction, type Db } from "@/shared/db";
import { addAccount, addAddress, addCartItem, SAMPLE_ADDRESS } from "@/shared/db/builders";
import { PARCEL_STATUS, PRODUCT_STATUS } from "@/shared/statuses";
import { LOCATIONS, PERSON_LAST } from "./catalog";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const S = PARCEL_STATUS;

/** ชื่อของบัญชี buyer4 ถึง buyer24 ไม่ซ้ำกับชื่อผู้ขายตัวอย่าง รวมกับ buyer1 ถึง buyer3 เป็นผู้เขียนรีวิว 24 บัญชี (REV-019) */
const BUYER_NAMES = [
  "นภา", "ธนา", "กิตติ", "พิมพ์", "อรุณ", "จันทร์", "ประเสริฐ", "ศิริ", "วรรณ", "ณัฐ", "ชนิดา",
  "บุญมี", "เกษม", "ลัดดา", "ไพโรจน์", "รัตนา", "ธีระ", "มาลัย", "อนันต์", "ดวงใจ", "เอกชัย",
];

const GOOD = ["ของดีมาก", "คุ้มราคา", "ชอบมาก", "ตรงปก", "คุณภาพดีเกินราคา", "ใช้งานได้ดี", "ประทับใจ", "สวยกว่าในรูป", "งานเรียบร้อย", "แนะนำเลย"];
const FAIR = ["พอใช้ได้", "ก็โอเคตามราคา", "ธรรมดา ไม่ได้แย่", "ใช้ได้ แต่ไม่ถึงกับว้าว"];
const POOR = ["ไม่ค่อยตรงปก", "ผิดหวังนิดหน่อย", "คุณภาพไม่สมราคา", "ของมีตำหนิ"];
const PRAISE = [
  "ส่งไวมาก",
  "แพ็คมาอย่างดี",
  "ร้านตอบแชทไว",
  "ได้ของครบตามที่สั่ง",
  "ขนาดพอดี",
  "สีตรงตามรูป",
  "ใช้มาหนึ่งสัปดาห์ยังดีอยู่",
  "จะกลับมาซื้ออีก",
  "ซื้อเป็นของขวัญ ผู้รับชอบ",
];
const COMPLAINTS = ["กล่องบุบเล็กน้อย", "ส่งช้ากว่าที่คิดไปสองวัน", "วัสดุบางกว่าที่คิด", "สีไม่เหมือนในรูป"];
const THANKS = ["ขอบคุณที่อุดหนุนครับ", "ขอบคุณสำหรับรีวิวค่ะ ไว้มาอุดหนุนใหม่นะคะ", "ขอบคุณมากครับ ดีใจที่ชอบสินค้า"];
const SORRY = ["ขออภัยในความไม่สะดวกครับ ร้านจะปรับปรุงให้ดีขึ้น", "ขอโทษด้วยนะคะ ทักแชทร้านได้เลย ร้านยินดีดูแลค่ะ"];

/** สัดส่วนสะสมของ 5 4 3 2 1 ดาว: 52 25 11 6 6 เปอร์เซ็นต์ อยู่กลางช่วงที่ REV-019 กำหนด */
const RATING_STEPS: [number, number][] = [
  [0.52, 5],
  [0.77, 4],
  [0.88, 3],
  [0.94, 2],
  [1, 1],
];
/** สัดส่วนสะสมของจำนวนรีวิวต่อสินค้า 1 ถึง 12 รีวิว เฉลี่ยราว 2.7 */
const COUNT_STEPS: [number, number][] = [
  [0.35, 1],
  [0.6, 2],
  [0.78, 3],
  [0.88, 4],
  [0.94, 6],
  [0.98, 9],
  [1, 12],
];

// สุ่มแบบกำหนดเมล็ด รันกี่ครั้งก็ได้รีวิวชุดเดิม
function createRandom(seedValue: number) {
  let state = seedValue;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    pick: <T>(items: T[]) => items[Math.floor(next() * items.length)],
    step: (steps: [number, number][]) => {
      const value = next();
      return steps.find(([limit]) => value < limit)?.[1] ?? steps[steps.length - 1][1];
    },
  };
}

type Purchase = { variantId: number; productId: number; review: boolean };

/**
 * รีวิวตัวอย่างของ REV-019 ทุกรีวิวมาจากคำสั่งซื้อที่ `สำเร็จ` ของผู้ซื้อตัวอย่าง
 * คำสั่งซื้อ การจ่ายเงิน การจัดส่ง รีวิว คำตอบของร้าน และการซ่อน ผ่านกฎจริงทั้งหมด สต็อกและประวัติจึงตรงกัน
 * คำสั่งซื้อย้อนหลังราว 100 วัน เพื่อให้วันที่ส่งรีวิวกระจายได้ทั้ง 90 วัน
 */
export async function addSampleReviews(db: Db, now: number, demoPassword: string): Promise<void> {
  const random = createRandom(20261126);
  const passwordHash = await hashPassword(demoPassword);
  const admin = db.prepare("SELECT id FROM accounts WHERE is_admin = 1 ORDER BY id LIMIT 1").get() as { id: number };
  const adminActor = { id: admin.id, isAdmin: true, shopId: null };

  transaction(db, () => {
    BUYER_NAMES.forEach((first, i) => {
      const name = `${first} ${PERSON_LAST[i % PERSON_LAST.length]}`;
      const account = addAccount(db, { email: `buyer${i + 4}@example.com`, passwordHash, displayName: name });
      addAddress(db, { accountId: account.id, isDefault: true, address: { ...SAMPLE_ADDRESS, ...LOCATIONS[i % LOCATIONS.length], name } });
    });
  });
  const buyers = (
    db.prepare("SELECT id FROM accounts WHERE email LIKE 'buyer%@example.com' ORDER BY length(email), email").all() as { id: number }[]
  ).map((row) => row.id);

  // เลือกสินค้าราว 65 เปอร์เซ็นต์หลังตัดชิ้นที่สต็อกไม่พอ แต่ละชิ้นได้ผู้ซื้อไม่ซ้ำกัน 1 ถึง 12 คน และเหลือสต็อกอย่างน้อย 1 ชิ้นเสมอ
  const variants = db
    .prepare(
      `SELECT v.id, v.product_id, v.stock FROM variants v JOIN products p ON p.id = v.product_id
       WHERE p.status = ? AND v.removed_at IS NULL AND v.price IS NOT NULL
       ORDER BY v.product_id, v.stock DESC, v.id`,
    )
    .all(PRODUCT_STATUS.onSale) as { id: number; product_id: number; stock: number }[];
  const purchases = new Map<number, Purchase[]>(buyers.map((id) => [id, []]));
  const reviewed: { id: number; product_id: number }[] = [];
  let lastProduct = 0;
  for (const variant of variants) {
    if (variant.product_id === lastProduct) continue;
    lastProduct = variant.product_id;
    const wanted = random.next() < 0.68 ? random.step(COUNT_STEPS) : 0;
    const count = Math.min(wanted, variant.stock - 1, buyers.length);
    if (count < 1) continue;
    reviewed.push(variant);
    const order = buyers.map((id) => ({ id, key: random.next() })).sort((a, b) => a.key - b.key);
    for (const { id } of order.slice(0, count)) purchases.get(id)?.push({ variantId: variant.id, productId: variant.product_id, review: true });
  }
  // buyer1 มีรายการที่รอรีวิวไว้ให้ลองเขียน 2 รายการ (REV-019)
  const mine = purchases.get(buyers[0]) ?? [];
  const spare = reviewed.filter((variant) => !mine.some((purchase) => purchase.productId === variant.product_id)).slice(0, 2);
  for (const variant of spare) mine.push({ variantId: variant.id, productId: variant.product_id, review: false });

  const provider = createSimulator();
  const card = { number: "4242424242424242", name: "SAMPLE BUYER", expiry: "12/30", securityCode: "123" };
  const reviewItems: { buyerId: number; orderItemId: number; shopId: number; productId: number; coverUrl: string | null }[] = [];

  for (const [index, buyerId] of buyers.entries()) {
    const wanted = purchases.get(buyerId) ?? [];
    if (wanted.length === 0) continue;
    const placedAt = now - 100 * DAY + index * 3 * HOUR;
    const groupId = transaction(db, () => {
      for (const purchase of wanted) addCartItem(db, { accountId: buyerId, variantId: purchase.variantId, quantity: 1 });
      const checkout = getCheckout(db, buyerId);
      const lines = checkout.shops.flatMap((shop) =>
        shop.lines.map((line) => ({ cartItemId: line.cartItemId, quantity: line.quantity, unitPrice: line.unitPrice ?? 0 })),
      );
      const placed = placeOrder(db, { buyerAccountId: buyerId, addressId: checkout.addresses[0].id, orderKey: checkout.orderKey, lines }, new Date(placedAt));
      if (!placed.ok) throw new Error(`สร้างคำสั่งซื้อของรีวิวตัวอย่างไม่ได้ ${JSON.stringify(placed)}`);
      return placed.groupId;
    });
    await payByCard(db, provider, { buyerId, groupId, card }, new Date(placedAt + 10 * MINUTE));

    transaction(db, () => {
      const parcels = db
        .prepare(
          `SELECT p.tracking_no, p.origin_province, o.ship_province FROM parcels p JOIN orders o ON o.id = p.order_id
           WHERE o.group_id = ? ORDER BY o.id`,
        )
        .all(groupId) as { tracking_no: string; origin_province: string; ship_province: string }[];
      for (const parcel of parcels) {
        const steps = [
          { to: S.handedOver, location: "ไปรษณีย์ใกล้ร้าน", province: parcel.origin_province },
          { to: S.inTransit, location: "ศูนย์คัดแยกต้นทาง", province: parcel.origin_province },
          { to: S.outForDelivery, location: "ศูนย์กระจายสินค้าปลายทาง", province: parcel.ship_province },
          { to: S.delivered, location: "ที่อยู่ผู้รับ", province: parcel.ship_province },
        ];
        let from: string = S.awaitingPacking;
        steps.forEach((step, i) => {
          const changed = changeParcelStatus(
            db,
            { trackingNo: parcel.tracking_no, actor: adminActor, from, ...step, receiverName: "ผู้ซื้อตัวอย่าง" },
            new Date(placedAt + (i + 1) * 20 * HOUR),
          );
          if (!changed.ok) throw new Error(`เปลี่ยนสถานะพัสดุของรีวิวตัวอย่างไม่ได้ ${JSON.stringify(changed)}`);
          from = step.to;
        });
        const received = confirmReceipt(db, parcel.tracking_no, { id: buyerId, isAdmin: false, shopId: null }, new Date(placedAt + 81 * HOUR));
        if (!received.ok) throw new Error(`ยืนยันรับสินค้าของรีวิวตัวอย่างไม่ได้ ${received.error}`);
      }
    });

    const toReview = new Set(wanted.filter((purchase) => purchase.review).map((purchase) => purchase.variantId));
    const items = db
      .prepare(
        `SELECT i.id, i.variant_id, i.product_id, i.cover_image_url, o.shop_id FROM order_items i JOIN orders o ON o.id = i.order_id
         WHERE o.group_id = ? ORDER BY i.id`,
      )
      .all(groupId) as { id: number; variant_id: number; product_id: number; cover_image_url: string | null; shop_id: number }[];
    for (const item of items) {
      if (!toReview.has(item.variant_id)) continue;
      reviewItems.push({ buyerId, orderItemId: item.id, shopId: item.shop_id, productId: item.product_id, coverUrl: item.cover_image_url });
    }
  }

  transaction(db, () => {
    const usedBodies = new Map<number, Set<string>>();
    const uploads = new Map<string, string>();
    let hidden = 0;
    let editable = false;

    for (const item of reviewItems.sort((a, b) => a.orderItemId - b.orderItemId)) {
      const rating = random.step(RATING_STEPS);
      // รีวิวล่าสุดของ buyer1 อยู่ใน 7 วัน จึงยังแก้ได้ (REV-019)
      const recent = !editable && item.buyerId === buyers[0];
      if (recent) editable = true;
      const at = recent ? now - DAY : now - HOUR - Math.floor(random.next() * (90 * DAY - 2 * HOUR));

      let body = "";
      if (random.next() < 0.78) {
        const used = usedBodies.get(item.productId) ?? new Set<string>();
        usedBodies.set(item.productId, used);
        do {
          body =
            rating >= 4
              ? `${random.pick(GOOD)} ${random.pick(PRAISE)}`
              : `${random.pick(rating === 3 ? FAIR : POOR)} ${random.pick(rating === 3 ? [...PRAISE, ...COMPLAINTS] : COMPLAINTS)}`;
        } while (used.has(body));
        used.add(body);
      }

      const images: string[] = [];
      if (item.coverUrl?.startsWith(IMAGE_URL_PREFIX) && random.next() < 0.09) {
        const key = `${item.buyerId}:${item.coverUrl}`;
        let url = uploads.get(key);
        if (!url) {
          const file = getImageFile(db, item.coverUrl.slice(IMAGE_URL_PREFIX.length));
          const saved = file && saveReviewImage(db, item.buyerId, file.data, new Date(at));
          if (!saved?.ok) throw new Error(`เก็บรูปของรีวิวตัวอย่างไม่ได้ ${item.coverUrl}`);
          url = saved.url;
          uploads.set(key, url);
        }
        images.push(url);
      }

      const sent = submitReview(db, { buyerAccountId: item.buyerId, orderItemId: item.orderItemId, rating, body, images }, new Date(at));
      if (!sent.ok) throw new Error(`ส่งรีวิวตัวอย่างไม่ได้ ${JSON.stringify(sent.errors)}`);

      if (random.next() < 0.4) {
        const replyAt = Math.min(at + Math.floor(random.next() * 2 * DAY) + HOUR, now);
        const replied = replyToReview(
          db,
          { shopId: item.shopId, reviewId: sent.reviewId, body: random.pick(rating >= 4 ? THANKS : SORRY), editing: false },
          new Date(replyAt),
        );
        if (!replied.ok) throw new Error(`ตอบรีวิวตัวอย่างไม่ได้ ${JSON.stringify(replied)}`);
      }
      if (rating === 1 && body && hidden < 6 && !recent) {
        hidden += 1;
        const hid = hideReview(db, { adminAccountId: admin.id, reviewId: sent.reviewId, reason: "ใช้คำไม่สุภาพ" }, new Date(Math.min(at + DAY, now)));
        if (!hid.ok) throw new Error(`ซ่อนรีวิวตัวอย่างไม่ได้ ${JSON.stringify(hid)}`);
      }
    }
  });
}
