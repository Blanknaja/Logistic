import { transaction, type Db } from "@/shared/db";
import { formatNumber } from "@/shared/format";
import { PRODUCT_STATUS, SHOP_STATUS } from "@/shared/statuses";

export const CART_CHANGED = "มีรายการเปลี่ยนแปลง กรุณาตรวจอีกครั้ง";
const QUANTITY_TOO_LOW = "จำนวนต้องเป็น 1 ขึ้นไป";
const SOLD_OUT = "สินค้าหมด";
const NOT_FOR_SALE = "สินค้านี้ไม่เปิดขายแล้ว";
const SHOP_CLOSED = "ร้านนี้ไม่เปิดขายตอนนี้";
const OWN_SHOP = "ซื้อสินค้าจากร้านตัวเองไม่ได้";

export type CartItem = {
  id: number;
  variantId: number;
  productId: number;
  name: string;
  variantLabel: string;
  imageUrl: string | null;
  /** ราคาปัจจุบันต่อชิ้น */
  price: number;
  /** ราคาที่ผู้ซื้อเห็นล่าสุด ถ้าต่างจากราคาปัจจุบัน (CRT-013) */
  priceChangedFrom: number | null;
  quantity: number;
  stock: number;
  selected: boolean;
  lineTotal: number;
  /** เหตุที่ซื้อไม่ได้ (CRT-014) หรือ null ถ้าซื้อได้ */
  unavailable: string | null;
  /** ข้อความเมื่อระบบเพิ่งปรับจำนวนลงตามสต็อก */
  notice: string | null;
};

export type CartShop = { id: number; name: string; items: CartItem[]; total: number };

export type Cart = {
  shops: CartShop[];
  /** ยอดค่าสินค้าของรายการที่เลือก ไม่รวมค่าส่ง */
  total: number;
  /** จำนวนชิ้นรวมของรายการที่เลือก */
  pieces: number;
  itemCount: number;
};

/** สิ่งที่หน้าตะกร้าแสดงอยู่ตอนกด "สั่งซื้อ" ใช้เทียบกับค่าล่าสุด (CRT-015) */
export type ShownItem = { itemId: number; price: number; quantity: number };

type Row = {
  id: number;
  variant_id: number;
  quantity: number;
  selected: number;
  last_seen_price: number;
  last_seen_image_url: string | null;
  price: number | null;
  stock: number;
  removed_at: string | null;
  product_id: number;
  name: string;
  product_status: string;
  shop_id: number;
  shop_name: string;
  shop_status: string;
  cover: string | null;
  label: string;
};

function parseQuantity(text: string): number | null {
  if (!/^\s*\d+\s*$/.test(text)) return null;
  const quantity = Number(text);
  return Number.isSafeInteger(quantity) && quantity >= 1 ? quantity : null;
}

const maxQuantity = (stock: number) => `ใส่ได้ไม่เกิน ${formatNumber(stock)} ชิ้น`;

function unavailableReason(row: Pick<Row, "shop_status" | "product_status" | "removed_at" | "price" | "stock">): string | null {
  if (row.shop_status !== SHOP_STATUS.open) return SHOP_CLOSED;
  if (row.product_status !== PRODUCT_STATUS.onSale || row.removed_at !== null || row.price === null) return NOT_FOR_SALE;
  if (row.stock <= 0) return SOLD_OUT;
  return null;
}

export function countCartItems(db: Db, accountId: number): number {
  return Number(db.prepare("SELECT count(*) AS n FROM cart_items WHERE account_id = ?").get(accountId)?.n);
}

/** สินค้าของแบบย่อยนี้ ใช้พากลับหน้าสินค้าเดิมหลังเข้าสู่ระบบ (CRT-003) */
export function variantProductId(db: Db, variantId: number): number | null {
  const row = db.prepare("SELECT product_id FROM variants WHERE id = ?").get(variantId) as { product_id: number } | undefined;
  return row?.product_id ?? null;
}

/** ปุ่ม "ใส่ตะกร้า" ในหน้ารายละเอียดสินค้า (CRT-001 CRT-002 CRT-004 CRT-005) */
export function addToCart(
  db: Db,
  accountId: number,
  input: { variantId: number; quantity: string },
  now: Date = new Date(),
): { ok: boolean; message: string } {
  return transaction(db, () => {
    const variant = db
      .prepare(
        `SELECT v.price, v.stock, v.removed_at, p.status AS product_status, p.name,
                s.status AS shop_status, s.owner_account_id,
                (SELECT url FROM product_images WHERE product_id = p.id ORDER BY position LIMIT 1) AS cover
         FROM variants v JOIN products p ON p.id = v.product_id JOIN shops s ON s.id = p.shop_id
         WHERE v.id = ?`,
      )
      .get(input.variantId) as
      | (Pick<Row, "price" | "stock" | "removed_at" | "product_status" | "name" | "shop_status" | "cover"> & {
          owner_account_id: number;
        })
      | undefined;
    if (!variant) return { ok: false, message: NOT_FOR_SALE };
    if (variant.owner_account_id === accountId) return { ok: false, message: OWN_SHOP };    const reason = unavailableReason(variant);
    if (reason) return { ok: false, message: reason };
    const quantity = parseQuantity(input.quantity);
    if (quantity === null) return { ok: false, message: QUANTITY_TOO_LOW };

    const existing = db
      .prepare("SELECT quantity FROM cart_items WHERE account_id = ? AND variant_id = ?")
      .get(accountId, input.variantId) as { quantity: number } | undefined;
    const inCart = existing?.quantity ?? 0;
    if (inCart + quantity > variant.stock) {
      const message = inCart
        ? `เพิ่มได้อีกไม่เกิน ${formatNumber(Math.max(variant.stock - inCart, 0))} ชิ้น เพราะในตะกร้ามีอยู่แล้ว ${formatNumber(inCart)} ชิ้น`
        : maxQuantity(variant.stock);
      return { ok: false, message };
    }

    const at = now.toISOString();
    db.prepare(
      `INSERT INTO cart_items (account_id, variant_id, quantity, selected, last_seen_price, last_seen_name, last_seen_image_url, added_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)
       ON CONFLICT (account_id, variant_id) DO UPDATE SET
         quantity = quantity + excluded.quantity, selected = 1, last_seen_price = excluded.last_seen_price,
         last_seen_name = excluded.last_seen_name, last_seen_image_url = excluded.last_seen_image_url,
         added_at = excluded.added_at, updated_at = excluded.updated_at`,
    ).run(accountId, input.variantId, quantity, variant.price, variant.name, variant.cover, at, at);
    return { ok: true, message: "ใส่ตะกร้าแล้ว" };
  });
}

/**
 * ตะกร้าของบัญชีนี้ด้วยราคา สต็อก และสถานะล่าสุด จัดกลุ่มตามร้าน (CRT-006)
 * รายการที่ซื้อไม่ได้ถูกเลิกเลือก และจำนวนที่เกินสต็อกถูกปรับลง (CRT-014) แล้วบันทึกไว้เลย
 */
export function getCart(db: Db, accountId: number, now: Date = new Date()): Cart {
  return transaction(db, () => {
    const rows = db
      .prepare(
        `SELECT ci.id, ci.variant_id, ci.quantity, ci.selected, ci.last_seen_price, ci.last_seen_image_url,
                v.price, v.stock, v.removed_at, p.id AS product_id, p.name, p.status AS product_status,
                s.id AS shop_id, s.name AS shop_name, s.status AS shop_status,
                (SELECT url FROM product_images WHERE product_id = p.id ORDER BY position LIMIT 1) AS cover,
                trim(coalesce(o1.value, '') || ' ' || coalesce(o2.value, '')) AS label
         FROM cart_items ci
         JOIN variants v ON v.id = ci.variant_id
         JOIN products p ON p.id = v.product_id
         JOIN shops s ON s.id = p.shop_id
         LEFT JOIN product_option_values o1 ON o1.id = v.option_value1_id
         LEFT JOIN product_option_values o2 ON o2.id = v.option_value2_id
         WHERE ci.account_id = ?
         ORDER BY ci.added_at DESC, ci.id DESC`,
      )
      .all(accountId) as Row[];

    const at = now.toISOString();
    const deselect = db.prepare("UPDATE cart_items SET selected = 0, updated_at = ? WHERE id = ?");
    const lower = db.prepare("UPDATE cart_items SET quantity = ?, updated_at = ? WHERE id = ?");
    const shops = new Map<number, CartShop>();
    const cart: Cart = { shops: [], total: 0, pieces: 0, itemCount: rows.length };

    for (const row of rows) {
      const unavailable = unavailableReason(row);
      let selected = row.selected === 1;
      let quantity = row.quantity;
      let notice: string | null = null;
      if (unavailable && selected) {
        selected = false;
        deselect.run(at, row.id);
      }
      if (!unavailable && quantity > row.stock) {
        quantity = row.stock;
        notice = `ปรับจำนวนเหลือ ${formatNumber(quantity)} ชิ้น เพราะสินค้าเหลือ ${formatNumber(quantity)} ชิ้น`;
        lower.run(quantity, at, row.id);
      }
      const price = row.price ?? row.last_seen_price;
      const item: CartItem = {
        id: row.id,
        variantId: row.variant_id,
        productId: row.product_id,
        name: row.name,
        variantLabel: row.label,
        imageUrl: row.cover ?? row.last_seen_image_url,
        price,
        priceChangedFrom: !unavailable && price !== row.last_seen_price ? row.last_seen_price : null,
        quantity,
        stock: row.stock,
        selected,
        lineTotal: price * quantity,
        unavailable,
        notice,
      };

      let shop = shops.get(row.shop_id);
      if (!shop) {
        shop = { id: row.shop_id, name: row.shop_name, items: [], total: 0 };
        shops.set(row.shop_id, shop);
        cart.shops.push(shop);
      }
      shop.items.push(item);
      if (selected) {
        shop.total += item.lineTotal;
        cart.total += item.lineTotal;
        cart.pieces += quantity;
      }
    }
    return cart;
  });
}

const findItem = (cart: Cart, itemId: number) =>
  cart.shops.flatMap((shop) => shop.items).find((item) => item.id === itemId);

/** ปุ่มบวก ปุ่มลบ หรือพิมพ์จำนวนในหน้าตะกร้า (CRT-005 CRT-010) */
export function changeQuantity(
  db: Db,
  accountId: number,
  itemId: number,
  quantityText: string,
  now: Date = new Date(),
): { ok: boolean; message: string | null } {
  return transaction(db, () => {
    const item = findItem(getCart(db, accountId, now), itemId);
    // รายการถูกลบจากอีกเครื่องแล้ว หน้าตะกร้าจะแสดงของที่เหลือจริงเอง
    if (!item) return { ok: true, message: null };
    if (item.unavailable) return { ok: false, message: item.unavailable };
    const quantity = parseQuantity(quantityText);
    if (quantity === null) return { ok: false, message: QUANTITY_TOO_LOW };
    if (quantity > item.stock) return { ok: false, message: maxQuantity(item.stock) };
    db.prepare("UPDATE cart_items SET quantity = ?, updated_at = ? WHERE id = ?").run(quantity, now.toISOString(), itemId);
    return { ok: true, message: null };
  });
}

/** ลบแล้วกู้คืนไม่ได้ ลบซ้ำหรือลบของคนอื่นไม่มีผล (CRT-011) */
export function removeCartItem(db: Db, accountId: number, itemId: number): void {
  db.prepare("DELETE FROM cart_items WHERE id = ? AND account_id = ?").run(itemId, accountId);
}

/** เลือกหรือเลิกเลือกหลายรายการพร้อมกัน รายการที่ซื้อไม่ได้เลือกไม่ได้ (CRT-012 CRT-014) */
export function setCartSelection(
  db: Db,
  accountId: number,
  itemIds: number[],
  selected: boolean,
  now: Date = new Date(),
): void {
  transaction(db, () => {
    const update = db.prepare("UPDATE cart_items SET selected = ?, updated_at = ? WHERE id = ?");
    const cart = getCart(db, accountId, now);
    for (const itemId of itemIds) {
      const item = findItem(cart, itemId);
      if (item && (!selected || !item.unavailable)) update.run(selected ? 1 : 0, now.toISOString(), itemId);
    }
  });
}

/** รายการที่เลือกและซื้อได้ ซึ่งหน้าสั่งซื้อจะใช้ (CRT-015 ส่งต่อให้ CHK-004) */
export function listSelectedCartItems(db: Db, accountId: number, now: Date = new Date()): CartItem[] {
  return getCart(db, accountId, now)
    .shops.flatMap((shop) => shop.items)
    .filter((item) => item.selected);
}

/**
 * ตรวจราคา สต็อก และสถานะของรายการที่เลือกอีกครั้งก่อนไปหน้าสั่งซื้อ (CRT-015)
 * ผ่านเมื่อรายการที่เลือก ราคา และจำนวนตรงกับที่หน้าจอแสดงทุกตัว แล้วถือว่าผู้ซื้อเห็นราคานี้แล้ว (CRT-013)
 */
export function confirmCheckout(
  db: Db,
  accountId: number,
  shown: ShownItem[],
  now: Date = new Date(),
): { ok: true } | { ok: false; message: string } {
  return transaction(db, () => {
    const selected = listSelectedCartItems(db, accountId, now);
    if (selected.length === 0 && shown.length === 0) return { ok: false, message: "ยังไม่ได้เลือกสินค้า" };
    const same =
      selected.length === shown.length &&
      selected.every((item) =>
        shown.some((s) => s.itemId === item.id && s.price === item.price && s.quantity === item.quantity),
      );
    if (!same) return { ok: false, message: CART_CHANGED };
    const seen = db.prepare("UPDATE cart_items SET last_seen_price = ?, updated_at = ? WHERE id = ?");
    for (const item of selected) seen.run(item.price, now.toISOString(), item.id);
    return { ok: true };
  });
}
