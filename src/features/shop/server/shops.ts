import { transaction, type Db } from "@/shared/db";
import { ORDER_STATUS, PRODUCT_STATUS, SHOP_STATUS, type ShopStatus } from "@/shared/statuses";
import { checkShopInput, logoType, SHOP_ERRORS, type ShopErrors, type ShopInput } from "./rules";

/** ไบต์ของรูปที่ผู้ขายส่งมา ยังไม่ได้ตรวจ */
export type LogoUpload = { bytes: Uint8Array };

/** undefined คงโลโก้เดิม "remove" กลับไปใช้ตัวอักษรแทนโลโก้ */
export type LogoChange = LogoUpload | "remove" | undefined;

export type OpenShopResult =
  | { ok: true; shopId: number }
  | { ok: false; errors: ShopErrors }
  | { ok: false; reason: "has-shop" | "admin" };

export type UpdateShopResult = { ok: true } | { ok: false; errors: ShopErrors } | { ok: false; reason: "not-found" | "suspended" };

/** ข้อมูลร้านทั้งหมดที่เจ้าของร้านเห็นในหน้าตั้งค่าร้าน */
export type ShopSettings = ShopInput & { id: number; status: ShopStatus; logoUrl: string | null; updatedAt: string };

export type ShopSummary = { id: number; name: string; logoUrl: string | null; status: ShopStatus };

type ShopRow = {
  id: number;
  name: string;
  description: string;
  logo_url: string | null;
  origin_sender_name: string;
  origin_phone: string;
  origin_address: string;
  origin_subdistrict: string;
  origin_district: string;
  origin_province: string;
  origin_postcode: string;
  status: ShopStatus;
  updated_at: string;
};

function nameTaken(db: Db, name: string, exceptShopId: number | null): boolean {
  // คอลัมน์ name เป็น COLLATE NOCASE จึงไม่สนตัวพิมพ์เล็กใหญ่ (SHP-004)
  return db.prepare("SELECT 1 FROM shops WHERE name = ? AND id IS NOT ?").get(name, exceptShopId) !== undefined;
}

/** ตรวจข้อมูลร้านกับรูปโลโก้พร้อมกัน เพื่อบอกทุกช่องที่ผิดในครั้งเดียว */
function check(db: Db, input: ShopInput, logo: LogoChange, shopId: number | null) {
  const { value, errors } = checkShopInput(input);
  const type = logo && logo !== "remove" ? logoType(logo.bytes) : null;
  if (logo && logo !== "remove" && !type) errors.logo = SHOP_ERRORS.logo;
  if (!errors.name && nameTaken(db, value.name, shopId)) errors.name = SHOP_ERRORS.nameTaken;
  return { value, errors, type };
}

function originColumns(value: ShopInput) {
  return [value.senderName, value.phone, value.address, value.subdistrict, value.district, value.province, value.postcode];
}

function replaceLogo(db: Db, shopId: number, logo: LogoChange, type: string | null, at: string): void {
  if (logo === undefined) return;
  // เก็บเฉพาะรูปล่าสุด (SHP ส่วนที่ 5)
  db.prepare("DELETE FROM shop_logos WHERE shop_id = ?").run(shopId);
  let url: string | null = null;
  if (logo !== "remove" && type) {
    const id = db
      .prepare("INSERT INTO shop_logos (shop_id, content_type, data, created_at) VALUES (?, ?, ?, ?)")
      .run(shopId, type, logo.bytes, at).lastInsertRowid;
    url = `/shop-logos/${id}`;
  }
  db.prepare("UPDATE shops SET logo_url = ? WHERE id = ?").run(url, shopId);
}

/** เปิดร้านให้บัญชีที่ยังไม่มีร้าน สถานะ `เปิดอยู่` ทันที (SHP-002 ถึง SHP-005) */
export function openShop(
  db: Db,
  accountId: number,
  input: ShopInput,
  logo: LogoUpload | undefined,
  now: Date = new Date(),
): OpenShopResult {
  return transaction(db, () => {
    const account = db
      .prepare(
        "SELECT a.is_admin, s.id AS shop_id FROM accounts a LEFT JOIN shops s ON s.owner_account_id = a.id WHERE a.id = ?",
      )
      .get(accountId) as { is_admin: number; shop_id: number | null } | undefined;
    if (!account) throw new Error(`ไม่พบบัญชี ${accountId}`);
    if (account.shop_id !== null) return { ok: false, reason: "has-shop" };
    if (account.is_admin === 1) return { ok: false, reason: "admin" };

    const { value, errors, type } = check(db, input, logo, null);
    if (Object.keys(errors).length > 0) return { ok: false, errors };

    const at = now.toISOString();
    const shopId = Number(
      db
        .prepare(
          `INSERT INTO shops (owner_account_id, name, description, origin_sender_name, origin_phone, origin_address,
             origin_subdistrict, origin_district, origin_province, origin_postcode, status, opened_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(accountId, value.name, value.description, ...originColumns(value), SHOP_STATUS.open, at, at).lastInsertRowid,
    );
    replaceLogo(db, shopId, logo, type, at);
    return { ok: true, shopId };
  });
}

/**
 * บันทึกการตั้งค่าร้าน ค่าที่บันทึกทีหลังเป็นค่าที่ใช้ (SHP-007 ถึง SHP-009)
 * ร้านที่ไม่ใช่ของบัญชีนี้ได้ผลเหมือนร้านที่ไม่มีอยู่ (SHP-015)
 */
export function updateShopSettings(
  db: Db,
  accountId: number,
  shopId: number,
  input: ShopInput,
  logo: LogoChange,
  now: Date = new Date(),
): UpdateShopResult {
  return transaction(db, () => {
    const shop = db.prepare("SELECT status FROM shops WHERE id = ? AND owner_account_id = ?").get(shopId, accountId) as
      | { status: ShopStatus }
      | undefined;
    if (!shop) return { ok: false, reason: "not-found" };
    if (shop.status === SHOP_STATUS.suspended) return { ok: false, reason: "suspended" };

    const { value, errors, type } = check(db, input, logo, shopId);
    if (Object.keys(errors).length > 0) return { ok: false, errors };

    const at = now.toISOString();
    db.prepare(
      `UPDATE shops SET name = ?, description = ?, origin_sender_name = ?, origin_phone = ?, origin_address = ?,
         origin_subdistrict = ?, origin_district = ?, origin_province = ?, origin_postcode = ?, updated_at = ?
       WHERE id = ?`,
    ).run(value.name, value.description, ...originColumns(value), at, shopId);
    replaceLogo(db, shopId, logo, type, at);
    return { ok: true };
  });
}

/** การตั้งค่าของร้านที่บัญชีนี้เป็นเจ้าของ null ถ้าบัญชีนี้ไม่มีร้าน */
export function getShopSettings(db: Db, accountId: number): ShopSettings | null {
  const row = db.prepare("SELECT * FROM shops WHERE owner_account_id = ?").get(accountId) as ShopRow | undefined;
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    logoUrl: row.logo_url,
    updatedAt: row.updated_at,
    name: row.name,
    description: row.description,
    senderName: row.origin_sender_name,
    phone: row.origin_phone,
    address: row.origin_address,
    subdistrict: row.origin_subdistrict,
    district: row.origin_district,
    province: row.origin_province,
    postcode: row.origin_postcode,
  };
}

/** ชื่อ โลโก้ และสถานะของร้าน ไม่มีที่อยู่ต้นทาง */
export function getShopSummary(db: Db, shopId: number): ShopSummary | null {
  const row = db.prepare("SELECT id, name, logo_url, status FROM shops WHERE id = ?").get(shopId) as
    | Pick<ShopRow, "id" | "name" | "logo_url" | "status">
    | undefined;
  return row ? { id: row.id, name: row.name, logoUrl: row.logo_url, status: row.status } : null;
}

/**
 * onSale คือสินค้าที่ขายอยู่ซึ่งมีแบบย่อยที่มีราคา ตรงกับที่หน้าร้านแสดง
 * listed คือสินค้าทุกชิ้นที่ยังไม่ถูกลบ ใช้บอกว่าร้านยังไม่เคยลงสินค้า (SHP-006)
 */
export function countShopProducts(db: Db, shopId: number): { onSale: number; listed: number } {
  const row = db
    .prepare(
      `SELECT
         count(*) FILTER (WHERE p.status = ? AND EXISTS (
           SELECT 1 FROM variants v WHERE v.product_id = p.id AND v.removed_at IS NULL AND v.price IS NOT NULL
         )) AS on_sale,
         count(*) FILTER (WHERE p.status <> ?) AS listed
       FROM products p WHERE p.shop_id = ?`,
    )
    .get(PRODUCT_STATUS.onSale, PRODUCT_STATUS.deleted, shopId) as { on_sale: number; listed: number };
  return { onSale: row.on_sale, listed: row.listed };
}

/** คำสั่งซื้อที่รอร้านจัดของ คือคำสั่งซื้อ `จ่ายแล้ว` ของร้าน (ORD-004) */
export function countOrdersAwaitingPacking(db: Db, shopId: number): number {
  return Number(
    db.prepare("SELECT count(*) AS n FROM orders WHERE shop_id = ? AND status = ?").get(shopId, ORDER_STATUS.paid)?.n,
  );
}

/** รูปโลโก้ที่ /shop-logos/<id> ชี้ถึง */
export function getShopLogo(db: Db, logoId: number): { contentType: string; data: Uint8Array<ArrayBuffer> } | null {
  const row = db.prepare("SELECT content_type, data FROM shop_logos WHERE id = ?").get(logoId) as
    | { content_type: string; data: Uint8Array<ArrayBuffer> }
    | undefined;
  return row ? { contentType: row.content_type, data: row.data } : null;
}
