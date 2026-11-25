// ตัวสร้างข้อมูลสำหรับ test และข้อมูลตัวอย่างเท่านั้น
// เขียนแถวลงฐานข้อมูลตรงๆ โดยข้ามกฎของธุรกิจ เช่น ไม่ตรวจข้อมูลและไม่ตัดสต็อก
// lint ห้ามโค้ดของแอปเรียกไฟล์นี้

import { randomBytes } from "node:crypto";
import { hashPasswordSync } from "@/features/account/server/password";
import { hashSessionToken } from "@/features/account/server/sessions";
import type { Db } from "@/shared/db";
import {
  ACCOUNT_STATUS,
  ORDER_STATUS,
  PARCEL_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  PRODUCT_STATUS,
  SHOP_STATUS,
  STOCK_CHANGE_REASON,
  type AccountStatus,
  type OrderStatus,
  type ParcelStatus,
  type PaymentMethod,
  type PaymentStatus,
  type ProductStatus,
  type ShopStatus,
} from "@/shared/statuses";

/** รหัสผ่านของบัญชีที่ addAccount สร้าง ถ้าไม่ได้ระบุ */
export const TEST_PASSWORD = "password123";

const SHIPPING_FEE = 40;
const PAYMENT_WINDOW_MS = 30 * 60 * 1000;

let sequence = 0;
const nextNumber = () => ++sequence;
const nowIso = () => new Date().toISOString();

let testPasswordHash: string | undefined;

type Row = Record<string, unknown>;

function insert(db: Db, table: string, values: Row): number {
  const columns = Object.keys(values).filter((key) => values[key] !== undefined);
  const sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`;
  const params = columns.map((key) => values[key]) as (string | number | null)[];
  return Number(db.prepare(sql).run(...params).lastInsertRowid);
}

// ACC ---------------------------------------------------------------------

export type AccountInput = {
  email?: string;
  /** ระบุเมื่อต้องการรหัสผ่านอื่นนอกจาก TEST_PASSWORD (hash ช้า ใช้เท่าที่จำเป็น) */
  password?: string;
  passwordHash?: string;
  displayName?: string;
  phone?: string | null;
  isAdmin?: boolean;
  status?: AccountStatus;
};

export function addAccount(db: Db, input: AccountInput = {}): { id: number; email: string } {
  const n = nextNumber();
  const email = input.email ?? `account${n}@example.com`;
  let passwordHash = input.passwordHash;
  if (!passwordHash && input.password) passwordHash = hashPasswordSync(input.password);
  passwordHash ??= testPasswordHash ??= hashPasswordSync(TEST_PASSWORD);
  const at = nowIso();
  const id = insert(db, "accounts", {
    email,
    password_hash: passwordHash,
    display_name: input.displayName ?? `บัญชีทดสอบ ${n}`,
    phone: input.phone ?? null,
    is_admin: input.isAdmin ? 1 : 0,
    status: input.status ?? ACCOUNT_STATUS.active,
    created_at: at,
    updated_at: at,
  });
  return { id, email };
}

/** สร้างการเข้าสู่ระบบของหนึ่งเครื่อง คืน token ที่จะอยู่ใน cookie */
export function addSession(db: Db, accountId: number, input: { expiresAt?: string } = {}): string {
  const token = randomBytes(32).toString("base64url");
  const at = new Date();
  insert(db, "sessions", {
    account_id: accountId,
    token_hash: hashSessionToken(token),
    created_at: at.toISOString(),
    last_used_at: at.toISOString(),
    expires_at: input.expiresAt ?? new Date(at.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
  return token;
}

// SHP ---------------------------------------------------------------------

export type Address = {
  name: string;
  phone: string;
  address: string;
  subdistrict: string;
  district: string;
  province: string;
  postcode: string;
};

export const SAMPLE_ADDRESS: Address = {
  name: "สมชาย ใจดี",
  phone: "0100000000",
  address: "99/1 ถนนตัวอย่าง",
  subdistrict: "ลุมพินี",
  district: "ปทุมวัน",
  province: "กรุงเทพมหานคร",
  postcode: "10330",
};

export type ShopInput = {
  ownerAccountId?: number;
  name?: string;
  description?: string;
  logoUrl?: string | null;
  status?: ShopStatus;
  origin?: Address;
  openedAt?: string;
};

export function addShop(db: Db, input: ShopInput = {}): { id: number; ownerAccountId: number } {
  const ownerAccountId = input.ownerAccountId ?? addAccount(db).id;
  const origin = input.origin ?? SAMPLE_ADDRESS;
  const at = input.openedAt ?? nowIso();
  const id = insert(db, "shops", {
    owner_account_id: ownerAccountId,
    name: input.name ?? `ร้านทดสอบ ${nextNumber()}`,
    description: input.description ?? "",
    logo_url: input.logoUrl ?? null,
    origin_sender_name: origin.name,
    origin_phone: origin.phone,
    origin_address: origin.address,
    origin_subdistrict: origin.subdistrict,
    origin_district: origin.district,
    origin_province: origin.province,
    origin_postcode: origin.postcode,
    status: input.status ?? SHOP_STATUS.open,
    opened_at: at,
    updated_at: at,
  });
  return { id, ownerAccountId };
}

// PRD และ INV -------------------------------------------------------------

export type ProductInput = {
  shopId?: number;
  categoryId?: number | null;
  name?: string;
  description?: string;
  status?: ProductStatus;
  /** ราคาของทุกแบบย่อย ถ้า variants ไม่ได้ระบุเอง */
  price?: number | null;
  /** สต็อกของทุกแบบย่อย ถ้า variants ไม่ได้ระบุเอง */
  stock?: number;
  /** ไม่เกิน 2 ตัวเลือก แบบย่อยเกิดจากการจับคู่ค่าตัวเลือกครบทุกแบบ */
  options?: { name: string; values: string[] }[];
  /** ค่าเฉพาะของแบบย่อย เรียงตามลำดับการจับคู่ เช่น [แดง S, แดง M, ดำ S, ดำ M] */
  variants?: { price?: number | null; stock?: number }[];
  images?: string[];
  /** เขียนประวัติสต็อก "ผู้ขายแก้" ของสต็อกตั้งต้น */
  recordStockHistory?: boolean;
  createdAt?: string;
  publishedAt?: string | null;
};

export function addProduct(db: Db, input: ProductInput = {}): { id: number; shopId: number; variantIds: number[] } {
  const shopId = input.shopId ?? addShop(db).id;
  const status = input.status ?? PRODUCT_STATUS.onSale;
  const createdAt = input.createdAt ?? nowIso();
  const publishedAt = input.publishedAt !== undefined ? input.publishedAt : status === PRODUCT_STATUS.draft ? null : createdAt;
  const options = input.options ?? [];
  if (options.length > 2) throw new Error("สินค้ามีตัวเลือกได้ไม่เกิน 2 ตัวเลือก");

  const productId = insert(db, "products", {
    shop_id: shopId,
    category_id: input.categoryId === undefined ? 1 : input.categoryId,
    name: input.name ?? `สินค้าทดสอบ ${nextNumber()}`,
    description: input.description ?? "รายละเอียดสินค้าทดสอบ",
    status,
    created_at: createdAt,
    updated_at: createdAt,
    published_at: publishedAt,
    deleted_at: status === PRODUCT_STATUS.deleted ? createdAt : null,
  });

  (input.images ?? [`/sample-images/p${productId}-1.svg`]).forEach((url, position) => {
    insert(db, "product_images", { product_id: productId, url, position, created_at: createdAt });
  });

  const valueIds = options.map((option, position) => {
    const optionId = insert(db, "product_options", { product_id: productId, name: option.name, position });
    return option.values.map((value, valuePosition) =>
      insert(db, "product_option_values", { option_id: optionId, value, position: valuePosition }),
    );
  });

  const combos: (number | null)[][] =
    valueIds.length === 0
      ? [[null, null]]
      : valueIds.length === 1
        ? valueIds[0].map((a) => [a, null])
        : valueIds[0].flatMap((a) => valueIds[1].map((b) => [a, b]));

  const variantIds = combos.map(([value1, value2], position) => {
    const custom = input.variants?.[position] ?? {};
    const stock = custom.stock ?? input.stock ?? 10;
    const variantId = insert(db, "variants", {
      product_id: productId,
      option_value1_id: value1,
      option_value2_id: value2,
      price: custom.price !== undefined ? custom.price : input.price !== undefined ? input.price : 100,
      stock,
      position,
      created_at: createdAt,
      updated_at: createdAt,
    });
    if (input.recordStockHistory && stock > 0) {
      insert(db, "stock_history", {
        variant_id: variantId,
        reason: STOCK_CHANGE_REASON.sellerEdit,
        change: stock,
        stock_after: stock,
        created_at: createdAt,
      });
    }
    return variantId;
  });

  return { id: productId, shopId, variantIds };
}

// CRT ---------------------------------------------------------------------

export function addCartItem(
  db: Db,
  input: { accountId: number; variantId: number; quantity?: number; selected?: boolean },
): { id: number } {
  const variant = variantSnapshot(db, input.variantId);
  const at = nowIso();
  const id = insert(db, "cart_items", {
    account_id: input.accountId,
    variant_id: input.variantId,
    quantity: input.quantity ?? 1,
    selected: input.selected === false ? 0 : 1,
    last_seen_price: variant.price,
    last_seen_name: variant.productName,
    last_seen_image_url: variant.coverImageUrl,
    added_at: at,
    updated_at: at,
  });
  return { id };
}

// CHK ---------------------------------------------------------------------

export function addAddress(
  db: Db,
  input: { accountId: number; isDefault?: boolean; address?: Address },
): { id: number } {
  const address = input.address ?? SAMPLE_ADDRESS;
  const at = nowIso();
  const id = insert(db, "shipping_addresses", {
    account_id: input.accountId,
    recipient_name: address.name,
    phone: address.phone,
    address: address.address,
    subdistrict: address.subdistrict,
    district: address.district,
    province: address.province,
    postcode: address.postcode,
    is_default: input.isDefault ? 1 : 0,
    created_at: at,
    updated_at: at,
  });
  return { id };
}

function variantSnapshot(db: Db, variantId: number) {
  const row = db
    .prepare(
      `SELECT v.id, v.price, p.id AS product_id, p.name AS product_name, p.shop_id,
              (SELECT url FROM product_images WHERE product_id = p.id ORDER BY position LIMIT 1) AS cover,
              trim(coalesce(v1.value, '') || ' ' || coalesce(v2.value, '')) AS label
       FROM variants v
       JOIN products p ON p.id = v.product_id
       LEFT JOIN product_option_values v1 ON v1.id = v.option_value1_id
       LEFT JOIN product_option_values v2 ON v2.id = v.option_value2_id
       WHERE v.id = ?`,
    )
    .get(variantId) as
    | { price: number | null; product_id: number; product_name: string; shop_id: number; cover: string | null; label: string }
    | undefined;
  if (!row) throw new Error(`ไม่มีแบบย่อย ${variantId}`);
  return {
    price: row.price ?? 0,
    productId: row.product_id,
    productName: row.product_name,
    shopId: row.shop_id,
    coverImageUrl: row.cover,
    label: row.label,
  };
}

export type OrderInput = {
  buyerAccountId: number;
  /** ทุกรายการต้องเป็นของร้านเดียวกัน */
  items: { variantId: number; quantity?: number }[];
  status?: OrderStatus;
  /** ใส่เพื่อให้หลายคำสั่งซื้ออยู่ในกลุ่มเดียวกัน ไม่ใส่จะสร้างกลุ่มใหม่ */
  groupId?: number;
  orderedAt?: string;
  address?: Address;
};

/** สร้างคำสั่งซื้อพร้อมสำเนาสินค้าและที่อยู่ ไม่ตัดสต็อกและไม่สร้างพัสดุ */
export function addOrder(db: Db, input: OrderInput): { id: number; orderNo: string; groupId: number } {
  if (input.items.length === 0) throw new Error("คำสั่งซื้อต้องมีสินค้าอย่างน้อย 1 รายการ");
  const lines = input.items.map((item) => ({ ...variantSnapshot(db, item.variantId), ...item, quantity: item.quantity ?? 1 }));
  const shopId = lines[0].shopId;
  if (lines.some((line) => line.shopId !== shopId)) throw new Error("หนึ่งคำสั่งซื้อมีสินค้าได้ร้านเดียว");

  const orderedAt = input.orderedAt ?? nowIso();
  const status = input.status ?? ORDER_STATUS.awaitingPayment;
  const itemsTotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const total = itemsTotal + SHIPPING_FEE;

  let groupId = input.groupId;
  if (groupId === undefined) {
    groupId = insert(db, "order_groups", {
      buyer_account_id: input.buyerAccountId,
      total: 0,
      created_at: orderedAt,
      payment_deadline: new Date(new Date(orderedAt).getTime() + PAYMENT_WINDOW_MS).toISOString(),
    });
  }
  db.prepare("UPDATE order_groups SET total = total + ? WHERE id = ?").run(total, groupId);

  const address = input.address ?? SAMPLE_ADDRESS;
  const yymmdd = orderedAt.slice(2, 10).replaceAll("-", "");
  const orderNo = `${yymmdd}${String(nextNumber() % 10000).padStart(4, "0")}`;
  const paid = status !== ORDER_STATUS.awaitingPayment && status !== ORDER_STATUS.cancelled;
  const id = insert(db, "orders", {
    order_no: orderNo,
    group_id: groupId,
    buyer_account_id: input.buyerAccountId,
    shop_id: shopId,
    status,
    items_total: itemsTotal,
    shipping_fee: SHIPPING_FEE,
    total,
    ship_recipient_name: address.name,
    ship_phone: address.phone,
    ship_address: address.address,
    ship_subdistrict: address.subdistrict,
    ship_district: address.district,
    ship_province: address.province,
    ship_postcode: address.postcode,
    ordered_at: orderedAt,
    paid_at: paid ? orderedAt : null,
    completed_at: status === ORDER_STATUS.completed ? orderedAt : null,
    cancelled_at: status === ORDER_STATUS.cancelled ? orderedAt : null,
  });

  for (const line of lines) {
    insert(db, "order_items", {
      order_id: id,
      product_id: line.productId,
      variant_id: line.variantId,
      product_name: line.productName,
      variant_label: line.label,
      unit_price: line.price,
      quantity: line.quantity,
      cover_image_url: line.coverImageUrl,
    });
  }
  return { id, orderNo, groupId };
}

// PAY ---------------------------------------------------------------------

/** สร้างการจ่ายเงินที่ครอบคลุมทุกคำสั่งซื้อในกลุ่ม ไม่เปลี่ยนสถานะคำสั่งซื้อ */
export function addPayment(
  db: Db,
  input: { groupId: number; method?: PaymentMethod; status?: PaymentStatus },
): { id: number } {
  const status = input.status ?? PAYMENT_STATUS.pending;
  const orders = db.prepare("SELECT id, total FROM orders WHERE group_id = ?").all(input.groupId) as {
    id: number;
    total: number;
  }[];
  const at = nowIso();
  const id = insert(db, "payments", {
    group_id: input.groupId,
    amount: orders.reduce((sum, order) => sum + order.total, 0),
    method: input.method ?? PAYMENT_METHOD.card,
    status,
    started_at: at,
    resolved_at: status === PAYMENT_STATUS.pending ? null : at,
  });
  for (const order of orders) {
    insert(db, "payment_orders", { payment_id: id, order_id: order.id, amount: order.total });
  }
  return { id };
}

// DLV ---------------------------------------------------------------------

/** สร้างพัสดุพร้อมประวัติการจัดส่งหนึ่งบรรทัดของสถานะปัจจุบัน ไม่เปลี่ยนสถานะคำสั่งซื้อ */
export function addParcel(
  db: Db,
  input: { orderId: number; status?: ParcelStatus; trackingNo?: string },
): { id: number; trackingNo: string } {
  const shop = db
    .prepare("SELECT s.* FROM orders o JOIN shops s ON s.id = o.shop_id WHERE o.id = ?")
    .get(input.orderId) as Record<string, string> | undefined;
  if (!shop) throw new Error(`ไม่มีคำสั่งซื้อ ${input.orderId}`);
  const status = input.status ?? PARCEL_STATUS.awaitingPacking;
  const trackingNo = input.trackingNo ?? `BS${String(nextNumber()).padStart(10, "0")}`;
  const at = nowIso();
  const id = insert(db, "parcels", {
    order_id: input.orderId,
    tracking_no: trackingNo,
    status,
    origin_sender_name: shop.origin_sender_name,
    origin_phone: shop.origin_phone,
    origin_address: shop.origin_address,
    origin_subdistrict: shop.origin_subdistrict,
    origin_district: shop.origin_district,
    origin_province: shop.origin_province,
    origin_postcode: shop.origin_postcode,
    receiver_name: status === PARCEL_STATUS.delivered ? SAMPLE_ADDRESS.name : null,
    delivered_at: status === PARCEL_STATUS.delivered ? at : null,
    created_at: at,
    updated_at: at,
  });
  insert(db, "parcel_history", { parcel_id: id, status, location: shop.origin_province, created_at: at });
  return { id, trackingNo };
}
