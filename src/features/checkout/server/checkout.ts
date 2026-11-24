import { createHash } from "node:crypto";
import { PAYMENT_WINDOW_MS } from "@/features/checkout/server/order-groups";
import { reserveOrderStock, stockShortageMessage } from "@/features/stock/server/reservation";
import { transaction, type Db } from "@/shared/db";
import { formatBaht } from "@/shared/format";
import { ORDER_STATUS, PRODUCT_STATUS, SHOP_STATUS } from "@/shared/statuses";

/** ค่าส่งคงที่ต่อหนึ่งคำสั่งซื้อ (product.md) */
export const SHIPPING_FEE = 40;

export const CART_CHANGED_MESSAGE = "รายการในตะกร้าเปลี่ยนไปแล้ว กลับไปตรวจที่ตะกร้า";

export type CheckoutLine = {
  cartItemId: number;
  variantId: number;
  productId: number;
  productName: string;
  variantLabel: string;
  coverImageUrl: string | null;
  /** ราคาปัจจุบันของแบบย่อย null เมื่อสินค้ายังไม่มีราคา */
  unitPrice: number | null;
  quantity: number;
  /** เหตุที่สั่งซื้อรายการนี้ไม่ได้ตอนนี้ null เมื่อสั่งได้ */
  problem: string | null;
};

export type CheckoutShop = {
  shopId: number;
  shopName: string;
  lines: CheckoutLine[];
  itemsTotal: number;
  shippingFee: number;
  total: number;
};

export type CheckoutAddress = {
  id: number;
  recipientName: string;
  phone: string;
  address: string;
  subdistrict: string;
  district: string;
  province: string;
  postcode: string;
  isDefault: boolean;
};

export type Checkout = {
  shops: CheckoutShop[];
  /** ที่อยู่หลักอยู่บนสุด */
  addresses: CheckoutAddress[];
  total: number;
  /** ส่งกลับมาตอนกดสั่งซื้อ หน้าสั่งซื้อเดียวกันได้ค่าเดียวกันเสมอ จึงกันการสร้างซ้ำได้ (CHK-007) */
  orderKey: string;
  /** ทุกรายการสั่งได้ และมีที่อยู่ให้เลือก */
  canOrder: boolean;
};

type LineRow = {
  cart_item_id: number;
  variant_id: number;
  quantity: number;
  added_at: string;
  product_id: number;
  product_name: string;
  product_status: string;
  variant_label: string;
  price: number | null;
  stock: number;
  removed_at: string | null;
  shop_id: number;
  shop_name: string;
  shop_status: string;
  shop_owner_id: number;
  cover_image_url: string | null;
};

const LINE_SELECT = `
  SELECT ci.id AS cart_item_id, ci.variant_id, ci.quantity, ci.added_at,
         p.id AS product_id, p.name AS product_name, p.status AS product_status,
         trim(coalesce(ov1.value, '') || ' ' || coalesce(ov2.value, '')) AS variant_label,
         v.price, v.stock, v.removed_at,
         s.id AS shop_id, s.name AS shop_name, s.status AS shop_status, s.owner_account_id AS shop_owner_id,
         (SELECT url FROM product_images WHERE product_id = p.id ORDER BY position LIMIT 1) AS cover_image_url
  FROM cart_items ci
  JOIN variants v ON v.id = ci.variant_id
  JOIN products p ON p.id = v.product_id
  JOIN shops s ON s.id = p.shop_id
  LEFT JOIN product_option_values ov1 ON ov1.id = v.option_value1_id
  LEFT JOIN product_option_values ov2 ON ov2.id = v.option_value2_id`;

/** เหตุที่สั่งซื้อรายการนี้ไม่ได้ เรียงจากเรื่องที่ผู้ซื้อแก้ไม่ได้ก่อน (CHK-006 INV-010) */
function lineProblem(row: LineRow, buyerAccountId: number): string | null {
  if (row.shop_owner_id === buyerAccountId) return "ซื้อสินค้าจากร้านตัวเองไม่ได้";
  if (row.shop_status !== SHOP_STATUS.open) return "ร้านนี้ไม่เปิดขายตอนนี้";
  if (row.product_status !== PRODUCT_STATUS.onSale || row.removed_at !== null || row.price === null) {
    return "สินค้านี้ไม่เปิดขายแล้ว";
  }
  return stockShortageMessage(row.stock, row.quantity);
}

function listAddresses(db: Db, buyerAccountId: number): CheckoutAddress[] {
  return db
    .prepare(
      `SELECT id, recipient_name, phone, address, subdistrict, district, province, postcode, is_default
       FROM shipping_addresses WHERE account_id = ? ORDER BY is_default DESC, created_at DESC, id DESC`,
    )
    .all(buyerAccountId)
    .map((row) => ({
      id: Number(row.id),
      recipientName: String(row.recipient_name),
      phone: String(row.phone),
      address: String(row.address),
      subdistrict: String(row.subdistrict),
      district: String(row.district),
      province: String(row.province),
      postcode: String(row.postcode),
      isDefault: row.is_default === 1,
    }));
}

function groupByShop(rows: LineRow[], buyerAccountId: number): CheckoutShop[] {
  const shops = new Map<number, CheckoutShop>();
  for (const row of rows) {
    let shop = shops.get(row.shop_id);
    if (!shop) {
      shop = { shopId: row.shop_id, shopName: row.shop_name, lines: [], itemsTotal: 0, shippingFee: SHIPPING_FEE, total: SHIPPING_FEE };
      shops.set(row.shop_id, shop);
    }
    shop.lines.push({
      cartItemId: row.cart_item_id,
      variantId: row.variant_id,
      productId: row.product_id,
      productName: row.product_name,
      variantLabel: row.variant_label,
      coverImageUrl: row.cover_image_url,
      unitPrice: row.price,
      quantity: row.quantity,
      problem: lineProblem(row, buyerAccountId),
    });
    shop.itemsTotal += (row.price ?? 0) * row.quantity;
    shop.total = shop.itemsTotal + shop.shippingFee;
  }
  return [...shops.values()];
}

/**
 * ข้อมูลหน้าสั่งซื้อจากรายการที่เลือกไว้ในตะกร้า ด้วยราคาปัจจุบัน (CHK-004)
 * อ่านอย่างเดียว ไม่จองสต็อกและไม่สร้างคำสั่งซื้อ
 */
export function getCheckout(db: Db, buyerAccountId: number): Checkout {
  const rows = db
    .prepare(`${LINE_SELECT} WHERE ci.account_id = ? AND ci.selected = 1 ORDER BY ci.added_at, ci.id`)
    .all(buyerAccountId) as LineRow[];
  const shops = groupByShop(rows, buyerAccountId);
  const addresses = listAddresses(db, buyerAccountId);
  const orderKey = createHash("sha256")
    .update(
      JSON.stringify(
        rows.map((row) => [row.cart_item_id, row.variant_id, row.added_at, row.quantity]).sort((a, b) => Number(a[0]) - Number(b[0])),
      ),
    )
    .digest("base64url")
    .slice(0, 32);
  return {
    shops,
    addresses,
    total: shops.reduce((sum, shop) => sum + shop.total, 0),
    orderKey,
    canOrder: shops.length > 0 && addresses.length > 0 && shops.every((shop) => shop.lines.every((line) => line.problem === null)),
  };
}

export type PlaceOrderInput = {
  buyerAccountId: number;
  addressId: number | null;
  orderKey: string;
  /** รายการตามที่หน้าสั่งซื้อแสดง ใช้ตรวจว่าราคาและจำนวนยังตรงกัน */
  lines: { cartItemId: number; quantity: number; unitPrice: number }[];
};

export type PlaceOrderFailure = {
  ok: false;
  /** ข้อความของแต่ละรายการ ตาม cartItemId */
  problems: Record<number, string>;
  addressProblem: string | null;
};

export type PlaceOrderResult = { ok: true; groupId: number; duplicate: boolean } | PlaceOrderFailure;

/** แปลงรายการที่หน้าสั่งซื้อส่งมา โยน error ถ้ารูปแบบผิด */
export function parseCheckoutLines(value: unknown): PlaceOrderInput["lines"] {
  const parsed: unknown = typeof value === "string" ? JSON.parse(value) : null;
  const positive = (n: unknown) => Number.isSafeInteger(n) && (n as number) > 0;
  if (
    !Array.isArray(parsed) ||
    parsed.length === 0 ||
    parsed.length > 500 ||
    !parsed.every((line) => positive(line?.cartItemId) && positive(line?.quantity) && Number.isSafeInteger(line?.unitPrice)) ||
    new Set(parsed.map((line) => line.cartItemId)).size !== parsed.length
  ) {
    throw new Error("รายการจากหน้าสั่งซื้อผิดรูปแบบ");
  }
  return parsed.map((line) => ({ cartItemId: line.cartItemId, quantity: line.quantity, unitPrice: line.unitPrice }));
}

/** เลขคำสั่งซื้อถัดไปของวันนั้นตามเวลาประเทศไทย: ปีเดือนวัน 6 หลัก ตามด้วยลำดับ 4 หลัก */
function nextOrderNo(db: Db, now: Date): string {
  const bangkok = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const day = bangkok.toISOString().slice(2, 10).replaceAll("-", "");
  const last = db
    .prepare("SELECT max(order_no) AS last FROM orders WHERE order_no BETWEEN ? AND ?")
    .get(`${day}0000`, `${day}9999`)?.last;
  const sequence = last ? Number(String(last).slice(6)) + 1 : 1;
  if (sequence > 9999) throw new Error(`เลขคำสั่งซื้อของวัน ${day} เต็ม 9999 แล้ว`);
  return `${day}${String(sequence).padStart(4, "0")}`;
}

/**
 * กดสั่งซื้อ (CHK-005 ถึง CHK-007 INV-009 ถึง INV-011)
 * ตรวจทุกรายการ ถ้าผ่านทั้งหมดจึงสร้างหนึ่งคำสั่งซื้อต่อร้านในกลุ่มคำสั่งซื้อเดียว จองสต็อก และเอารายการออกจากตะกร้า
 * ทั้งหมดอยู่ใน transaction เดียวที่จองสิทธิ์เขียนตั้งแต่ต้น คนที่กดพร้อมกันจึงถูกรับทีละคน
 * กดซ้ำด้วย orderKey เดิมได้กลุ่มเดิม (duplicate: true)
 */
export function placeOrder(db: Db, input: PlaceOrderInput, now: Date = new Date()): PlaceOrderResult {
  if (!input.orderKey || input.orderKey.length > 100) throw new Error("orderKey ผิดรูปแบบ");
  return transaction(db, (): PlaceOrderResult => {
    const existing = db
      .prepare("SELECT id FROM order_groups WHERE buyer_account_id = ? AND order_key = ?")
      .get(input.buyerAccountId, input.orderKey);
    if (existing) return { ok: true, groupId: Number(existing.id), duplicate: true };

    const address =
      input.addressId === null
        ? undefined
        : db.prepare("SELECT * FROM shipping_addresses WHERE id = ? AND account_id = ?").get(input.addressId, input.buyerAccountId);
    const addressProblem = address
      ? null
      : input.addressId === null
        ? "กรุณาเลือกที่อยู่จัดส่ง"
        : "ที่อยู่ที่เลือกถูกลบไปแล้ว เลือกที่อยู่อื่น";

    const byId = new Map(
      (
        db
          .prepare(`${LINE_SELECT} WHERE ci.account_id = ? AND ci.selected = 1 AND ci.id IN (SELECT value FROM json_each(?))`)
          .all(input.buyerAccountId, JSON.stringify(input.lines.map((line) => line.cartItemId))) as LineRow[]
      ).map((row) => [row.cart_item_id, row]),
    );
    const problems: Record<number, string> = {};
    for (const line of input.lines) {
      const row = byId.get(line.cartItemId);
      const problem =
        !row || row.quantity !== line.quantity
          ? CART_CHANGED_MESSAGE
          : (lineProblem(row, input.buyerAccountId) ??
            (row.price !== line.unitPrice ? `ราคาเปลี่ยนจาก ${formatBaht(line.unitPrice)} เป็น ${formatBaht(row.price!)}` : null));
      if (problem) problems[line.cartItemId] = problem;
    }
    if (addressProblem || Object.keys(problems).length > 0 || input.lines.length === 0) {
      return { ok: false, problems, addressProblem };
    }

    const rows = input.lines.map((line) => byId.get(line.cartItemId)!);
    const shops = groupByShop(rows, input.buyerAccountId);
    const at = now.toISOString();
    const groupId = Number(
      db
        .prepare(
          "INSERT INTO order_groups (buyer_account_id, total, created_at, payment_deadline, order_key) VALUES (?, ?, ?, ?, ?)",
        )
        .run(
          input.buyerAccountId,
          shops.reduce((sum, shop) => sum + shop.total, 0),
          at,
          new Date(now.getTime() + PAYMENT_WINDOW_MS).toISOString(),
          input.orderKey,
        ).lastInsertRowid,
    );

    const insertOrder = db.prepare(
      `INSERT INTO orders (order_no, group_id, buyer_account_id, shop_id, status, items_total, shipping_fee, total,
         ship_recipient_name, ship_phone, ship_address, ship_subdistrict, ship_district, ship_province, ship_postcode, ordered_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertItem = db.prepare(
      `INSERT INTO order_items (order_id, product_id, variant_id, product_name, variant_label, unit_price, quantity, cover_image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const shop of shops) {
      const orderId = Number(
        insertOrder.run(
          nextOrderNo(db, now),
          groupId,
          input.buyerAccountId,
          shop.shopId,
          ORDER_STATUS.awaitingPayment,
          shop.itemsTotal,
          shop.shippingFee,
          shop.total,
          address!.recipient_name,
          address!.phone,
          address!.address,
          address!.subdistrict,
          address!.district,
          address!.province,
          address!.postcode,
          at,
        ).lastInsertRowid,
      );
      for (const line of shop.lines) {
        insertItem.run(orderId, line.productId, line.variantId, line.productName, line.variantLabel, line.unitPrice, line.quantity, line.coverImageUrl);
      }
      reserveOrderStock(db, orderId, shop.lines, now);
    }

    db.prepare("DELETE FROM cart_items WHERE account_id = ? AND id IN (SELECT value FROM json_each(?))").run(
      input.buyerAccountId,
      JSON.stringify(input.lines.map((line) => line.cartItemId)),
    );
    return { ok: true, groupId, duplicate: false };
  });
}
