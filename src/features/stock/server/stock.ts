import { transaction, type Db } from "@/shared/db";
import { PAGE_SIZE, pageCount } from "@/shared/paging";
import { ORDER_STATUS, PRODUCT_STATUS, STOCK_CHANGE_REASON, type StockChangeReason } from "@/shared/statuses";
import { LOW_STOCK_MAX, stockLabel, type StockLabel } from "./labels";

export const MAX_STOCK = 999_999;

export type StockFilter = "all" | "low" | "out";

export type StockRow = {
  variantId: number;
  productName: string;
  /** ค่าตัวเลือกของแบบย่อย เช่น "แดง M" สินค้าที่ไม่มีตัวเลือกเป็นข้อความว่าง */
  variantLabel: string;
  stock: number;
  reserved: number;
  label: StockLabel | null;
};

export type StockList = {
  rows: StockRow[];
  counts: Record<StockFilter, number>;
  page: number;
  pageCount: number;
};

export type StockHistoryEntry = {
  id: number;
  createdAt: string;
  reason: StockChangeReason;
  change: number;
  stockAfter: number;
  orderNo: string | null;
};

export type StockHistory = {
  variantId: number;
  productName: string;
  variantLabel: string;
  stock: number;
  entries: StockHistoryEntry[];
  page: number;
  pageCount: number;
};

export type SaveStockResult =
  | { outcome: "saved" | "invalid" | "changed"; stock: number; reserved: number }
  | { outcome: "not-found" };

// แบบย่อยที่ผู้ขายจัดการได้: ของร้านนี้ สินค้ายังไม่ถูกลบ และแบบย่อยยังไม่เลิกใช้
const OWN_VARIANTS = `
  FROM variants v
  JOIN products p ON p.id = v.product_id
  LEFT JOIN product_option_values ov1 ON ov1.id = v.option_value1_id
  LEFT JOIN product_option_values ov2 ON ov2.id = v.option_value2_id
  WHERE p.shop_id = ? AND p.status <> ? AND v.removed_at IS NULL`;

const ROW_COLUMNS = `
  v.id, p.name AS product_name, v.stock,
  trim(coalesce(ov1.value, '') || ' ' || coalesce(ov2.value, '')) AS variant_label,
  (SELECT coalesce(sum(oi.quantity), 0) FROM order_items oi JOIN orders o ON o.id = oi.order_id
   WHERE oi.variant_id = v.id AND o.status = ?) AS reserved`;

const FILTER_SQL: Record<StockFilter, string> = {
  all: "",
  low: ` AND v.stock BETWEEN 1 AND ${LOW_STOCK_MAX}`,
  out: " AND v.stock = 0",
};

type RowRecord = { id: number; product_name: string; variant_label: string; stock: number; reserved: number };

function toRow(row: RowRecord): StockRow {
  return {
    variantId: row.id,
    productName: row.product_name,
    variantLabel: row.variant_label,
    stock: row.stock,
    reserved: row.reserved,
    label: stockLabel(row.stock),
  };
}

function pageOf(requested: number, total: number) {
  const pages = pageCount(total);
  const page = Number.isSafeInteger(requested) ? Math.min(Math.max(requested, 1), pages) : 1;
  return { page, pageCount: pages, offset: (page - 1) * PAGE_SIZE };
}

/** ค่าตัวกรองจากที่อยู่หน้าเว็บ ค่าที่ไม่รู้จักถือเป็น "ทั้งหมด" */
export function parseStockFilter(value: unknown): StockFilter {
  return value === "low" || value === "out" ? value : "all";
}

/** หน้าสต็อกของร้าน หนึ่งแถวต่อหนึ่งแบบย่อย เรียงตามชื่อสินค้า หน้าละ 20 แถว (INV-001 INV-003) */
export function listStock(db: Db, shopId: number, options: { filter?: StockFilter; page?: number } = {}): StockList {
  const filter = options.filter ?? "all";
  const totals = db
    .prepare(
      `SELECT count(*) AS total,
              coalesce(sum(v.stock BETWEEN 1 AND ${LOW_STOCK_MAX}), 0) AS low,
              coalesce(sum(v.stock = 0), 0) AS out
       ${OWN_VARIANTS}`,
    )
    .get(shopId, PRODUCT_STATUS.deleted) as { total: number; low: number; out: number };
  const counts = { all: totals.total, low: totals.low, out: totals.out };
  const { page, pageCount, offset } = pageOf(options.page ?? 1, counts[filter]);

  const rows = db
    .prepare(
      `SELECT ${ROW_COLUMNS} ${OWN_VARIANTS}${FILTER_SQL[filter]}
       ORDER BY p.name, p.id, v.position
       LIMIT ? OFFSET ?`,
    )
    .all(ORDER_STATUS.awaitingPayment, shopId, PRODUCT_STATUS.deleted, PAGE_SIZE, offset) as RowRecord[];

  return { rows: rows.map(toRow), counts, page, pageCount };
}

function findOwnVariant(db: Db, shopId: number | null, variantId: number): StockRow | null {
  if (shopId === null || !Number.isSafeInteger(variantId)) return null;
  const row = db
    .prepare(`SELECT ${ROW_COLUMNS} ${OWN_VARIANTS} AND v.id = ?`)
    .get(ORDER_STATUS.awaitingPayment, shopId, PRODUCT_STATUS.deleted, variantId) as RowRecord | undefined;
  return row ? toRow(row) : null;
}

/** จำนวนเต็ม 0 ถึง 999,999 หรือ null ถ้ากรอกไม่ถูกต้อง (INV-005) */
export function parseStockInput(value: string): number | null {
  const text = value.trim();
  if (!/^\d+$/.test(text)) return null;
  const stock = Number(text);
  return stock <= MAX_STOCK ? stock : null;
}

/**
 * ผู้ขายตั้งสต็อกของหนึ่งแบบย่อยเป็นจำนวนใหม่ (INV-004 ถึง INV-008)
 * expected คือสต็อกที่หน้าสต็อกแสดงให้ผู้ขายเห็นตอนกรอก ถ้าสต็อกเปลี่ยนไปแล้วจะไม่บันทึก
 */
export function setStock(
  db: Db,
  shopId: number | null,
  input: { variantId: number; expected: number; value: string },
  now: Date = new Date(),
): SaveStockResult {
  return transaction(db, () => {
    const row = findOwnVariant(db, shopId, input.variantId);
    if (!row) return { outcome: "not-found" };
    const current = { stock: row.stock, reserved: row.reserved };

    const next = parseStockInput(input.value);
    if (next === null) return { outcome: "invalid", ...current };
    // กดบันทึกซ้ำด้วยจำนวนเดิมได้ผลเหมือนครั้งแรก จึงตอบว่าบันทึกแล้วโดยไม่เพิ่มประวัติ
    if (next === row.stock) return { outcome: "saved", ...current };
    if (input.expected !== row.stock) return { outcome: "changed", ...current };

    const at = now.toISOString();
    db.prepare("UPDATE variants SET stock = ?, updated_at = ? WHERE id = ?").run(next, at, row.variantId);
    db.prepare(
      "INSERT INTO stock_history (variant_id, reason, change, stock_after, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(row.variantId, STOCK_CHANGE_REASON.sellerEdit, next - row.stock, next, at);
    return { outcome: "saved", stock: next, reserved: row.reserved };
  });
}

/** ประวัติสต็อกของหนึ่งแบบย่อยในร้านนี้ ใหม่ไปเก่า หน้าละ 20 บรรทัด หรือ null ถ้าไม่ใช่ของร้านนี้ (INV-015) */
export function getStockHistory(db: Db, shopId: number | null, variantId: number, requestedPage = 1): StockHistory | null {
  const row = findOwnVariant(db, shopId, variantId);
  if (!row) return null;

  const { total } = db.prepare("SELECT count(*) AS total FROM stock_history WHERE variant_id = ?").get(variantId) as {
    total: number;
  };
  const { page, pageCount, offset } = pageOf(requestedPage, total);
  const entries = db
    .prepare(
      `SELECT h.id, h.created_at, h.reason, h.change, h.stock_after, o.order_no
       FROM stock_history h LEFT JOIN orders o ON o.id = h.order_id
       WHERE h.variant_id = ?
       ORDER BY h.created_at DESC, h.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(variantId, PAGE_SIZE, offset) as {
    id: number;
    created_at: string;
    reason: StockChangeReason;
    change: number;
    stock_after: number;
    order_no: string | null;
  }[];

  return {
    variantId: row.variantId,
    productName: row.productName,
    variantLabel: row.variantLabel,
    stock: row.stock,
    entries: entries.map((entry) => ({
      id: entry.id,
      createdAt: entry.created_at,
      reason: entry.reason,
      change: entry.change,
      stockAfter: entry.stock_after,
      orderNo: entry.order_no,
    })),
    page,
    pageCount,
  };
}
