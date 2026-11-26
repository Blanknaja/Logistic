import { EDIT_WINDOW_MS, LIMITS, maskName, MESSAGES, PRODUCT_REVIEWS_PAGE_SIZE, textLength } from "@/features/review/rules";
import { transaction, type Db } from "@/shared/db";
import { clampPage, PAGE_SIZE, pageCount } from "@/shared/paging";
import type { Checked } from "@/shared/result";
import { ORDER_STATUS, REVIEW_STATUS, type OrderStatus, type ReviewStatus } from "@/shared/statuses";
import { onReviewHidden, onReviewPosted, onReviewReplied } from "./events";
import { isOwnReviewImage } from "./image-files";

// รีวิว คำตอบของร้าน และการซ่อน (REV-001 ถึง REV-004 และ REV-014 ถึง REV-017)

export type ReviewInput = { buyerAccountId: number; orderItemId: number; rating: number; body: string; images: string[] };
export type ReviewErrors = { rating?: string; body?: string; images?: string; form?: string };

/** ผลของการตอบ ซ่อน และเลิกซ่อน notFound คือรีวิวไม่มีหรือบัญชีนี้ไม่มีสิทธิ์ ให้แสดงหน้า "ไม่พบ" */
export type Outcome = { ok: true } | { ok: false; notFound: true } | { ok: false; error: string };

const NOT_FOUND = { ok: false, notFound: true } as const;

type Reply = { body: string; repliedAt: string; edited: boolean };

type ReviewRow = {
  id: number;
  order_item_id: number;
  buyer_account_id: number;
  product_id: number;
  shop_id: number;
  rating: number;
  body: string;
  status: ReviewStatus;
  created_at: string;
  edited_at: string | null;
  reply_body: string | null;
  replied_at: string | null;
  reply_edited_at: string | null;
  hidden_reason: string | null;
  hidden_at: string | null;
};

const replyOf = (row: ReviewRow): Reply | null =>
  row.reply_body === null || row.replied_at === null
    ? null
    : { body: row.reply_body, repliedAt: row.replied_at, edited: row.reply_edited_at !== null };

function imagesOf(db: Db, reviewId: number): string[] {
  return (db.prepare("SELECT url FROM review_images WHERE review_id = ? ORDER BY position").all(reviewId) as { url: string }[]).map(
    (row) => row.url,
  );
}

function replaceImages(db: Db, reviewId: number, urls: string[]): void {
  db.prepare("DELETE FROM review_images WHERE review_id = ?").run(reviewId);
  urls.forEach((url, position) => {
    db.prepare("INSERT INTO review_images (review_id, url, position) VALUES (?, ?, ?)").run(reviewId, url, position);
  });
}

/** ตรวจคะแนน ข้อความ และรูป kept คือรูปที่รีวิวนี้มีอยู่แล้ว ซึ่งใช้ต่อได้โดยไม่ต้องเป็นรูปที่ส่งขึ้นมาใหม่ */
function checkContent(db: Db, input: ReviewInput, kept: string[]): ReviewErrors | null {
  const errors: ReviewErrors = {};
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) errors.rating = MESSAGES.rating;
  if (textLength(input.body) > LIMITS.body) errors.body = MESSAGES.body;
  if (input.images.length > LIMITS.images) errors.images = MESSAGES.tooManyImages;
  else if (input.images.some((url) => !kept.includes(url) && !isOwnReviewImage(db, input.buyerAccountId, url))) {
    errors.images = MESSAGES.uploadFailed;
  }
  return Object.keys(errors).length > 0 ? errors : null;
}

type OwnItem = {
  id: number;
  product_id: number;
  shop_id: number;
  product_name: string;
  variant_label: string;
  cover_image_url: string | null;
  order_no: string;
  status: OrderStatus;
};

function findOwnItem(db: Db, buyerAccountId: number, orderItemId: number): OwnItem | undefined {
  if (!Number.isSafeInteger(orderItemId)) return undefined;
  return db
    .prepare(
      `SELECT i.id, i.product_id, o.shop_id, i.product_name, i.variant_label, i.cover_image_url, o.order_no, o.status
       FROM order_items i JOIN orders o ON o.id = i.order_id
       WHERE i.id = ? AND o.buyer_account_id = ?`,
    )
    .get(orderItemId, buyerAccountId) as OwnItem | undefined;
}

const reviewOfItem = (db: Db, orderItemId: number) =>
  db.prepare("SELECT * FROM reviews WHERE order_item_id = ?").get(orderItemId) as ReviewRow | undefined;

const editableUntil = (createdAt: string) => new Date(new Date(createdAt).getTime() + EDIT_WINDOW_MS);

/** ผู้ซื้อส่งรีวิวของรายการในคำสั่งซื้อของตัวเองที่ `สำเร็จ` หนึ่งรายการมีได้หนึ่งรีวิว (REV-001 REV-003) */
export function submitReview(db: Db, input: ReviewInput, now: Date = new Date()): Checked<{ reviewId: number }, ReviewErrors> {
  return transaction(db, () => {
    const item = findOwnItem(db, input.buyerAccountId, input.orderItemId);
    if (!item) return { ok: false, errors: { form: MESSAGES.orderNotFound } } as const;
    if (item.status !== ORDER_STATUS.completed) return { ok: false, errors: { form: MESSAGES.notCompleted } } as const;
    if (reviewOfItem(db, item.id)) return { ok: false, errors: { form: MESSAGES.alreadyReviewed } } as const;
    const errors = checkContent(db, input, []);
    if (errors) return { ok: false, errors } as const;

    const reviewId = Number(
      db
        .prepare(
          `INSERT INTO reviews (order_item_id, buyer_account_id, product_id, shop_id, rating, body, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(item.id, input.buyerAccountId, item.product_id, item.shop_id, input.rating, input.body.trim(), REVIEW_STATUS.visible, now.toISOString())
        .lastInsertRowid,
    );
    replaceImages(db, reviewId, input.images);
    onReviewPosted(db, reviewId, now);
    return { ok: true, reviewId } as const;
  });
}

/** ผู้ซื้อแก้รีวิวของตัวเองที่ `แสดงอยู่` ก่อนครบ 7 วันจากเวลาที่ส่งครั้งแรก คำตอบของร้านไม่เปลี่ยน (REV-004 REV-017) */
export function editReview(db: Db, input: ReviewInput, now: Date = new Date()): Checked<{ reviewId: number }, ReviewErrors> {
  return transaction(db, () => {
    const item = findOwnItem(db, input.buyerAccountId, input.orderItemId);
    const review = item && reviewOfItem(db, item.id);
    if (!review) return { ok: false, errors: { form: MESSAGES.orderNotFound } } as const;
    if (review.status === REVIEW_STATUS.hidden) return { ok: false, errors: { form: MESSAGES.hidden } } as const;
    if (now >= editableUntil(review.created_at)) return { ok: false, errors: { form: MESSAGES.editExpired } } as const;
    const errors = checkContent(db, input, imagesOf(db, review.id));
    if (errors) return { ok: false, errors } as const;

    db.prepare("UPDATE reviews SET rating = ?, body = ?, edited_at = ? WHERE id = ?").run(
      input.rating,
      input.body.trim(),
      now.toISOString(),
      review.id,
    );
    replaceImages(db, review.id, input.images);
    return { ok: true, reviewId: review.id } as const;
  });
}

export type OwnReview = {
  id: number;
  rating: number;
  body: string;
  images: string[];
  status: ReviewStatus;
  createdAt: string;
  edited: boolean;
  reply: Reply | null;
  /** เหตุผลที่ผู้ดูแลแพลตฟอร์มซ่อน มีเฉพาะตอนรีวิว `ถูกซ่อน` */
  hiddenReason: string | null;
  editableUntil: string;
  canEdit: boolean;
};

export type ReviewTarget =
  | { state: "notFound" }
  | { state: "notCompleted" }
  | {
      state: "open";
      item: { id: number; orderNo: string; productId: number; productName: string; variantLabel: string; coverImageUrl: string | null };
      review: OwnReview | null;
    };

/** รายการในคำสั่งซื้อที่ผู้ซื้อเปิดหน้าเขียนรีวิว พร้อมรีวิวของตัวเองถ้ามี แม้ถูกซ่อน (REV-001 REV-003 REV-017) */
export function getReviewTarget(db: Db, buyerAccountId: number, orderNo: string, orderItemId: number, now: Date = new Date()): ReviewTarget {
  const item = findOwnItem(db, buyerAccountId, orderItemId);
  if (!item || item.order_no !== orderNo) return { state: "notFound" };
  if (item.status !== ORDER_STATUS.completed) return { state: "notCompleted" };
  const row = reviewOfItem(db, item.id);
  const until = row && editableUntil(row.created_at);
  return {
    state: "open",
    item: {
      id: item.id,
      orderNo: item.order_no,
      productId: item.product_id,
      productName: item.product_name,
      variantLabel: item.variant_label,
      coverImageUrl: item.cover_image_url,
    },
    review:
      row && until
        ? {
            id: row.id,
            rating: row.rating,
            body: row.body,
            images: imagesOf(db, row.id),
            status: row.status,
            createdAt: row.created_at,
            edited: row.edited_at !== null,
            reply: replyOf(row),
            hiddenReason: row.status === REVIEW_STATUS.hidden ? row.hidden_reason : null,
            editableUntil: until.toISOString(),
            canEdit: row.status === REVIEW_STATUS.visible && now < until,
          }
        : null,
  };
}

/**
 * ร้านตอบรีวิวที่ `แสดงอยู่` ของสินค้าในร้านตัวเอง หนึ่งรีวิวมีได้หนึ่งคำตอบ editing คือแก้คำตอบที่มีอยู่ (REV-015)
 * ร้านที่ `ถูกระงับ` ยังตอบได้
 */
export function replyToReview(
  db: Db,
  input: { shopId: number; reviewId: number; body: string; editing: boolean },
  now: Date = new Date(),
): Outcome {
  return transaction(db, () => {
    const review = db.prepare("SELECT * FROM reviews WHERE id = ? AND shop_id = ?").get(input.reviewId, input.shopId) as ReviewRow | undefined;
    if (!review) return NOT_FOUND;
    if (review.status === REVIEW_STATUS.hidden) return { ok: false, error: MESSAGES.hidden };
    const length = textLength(input.body);
    if (length < 1 || length > LIMITS.reply) return { ok: false, error: MESSAGES.reply };
    const at = now.toISOString();
    if (review.reply_body === null) {
      db.prepare("UPDATE reviews SET reply_body = ?, replied_at = ? WHERE id = ?").run(input.body.trim(), at, review.id);
      onReviewReplied(db, review.id, now);
      return { ok: true };
    }
    if (!input.editing) return { ok: false, error: MESSAGES.alreadyReplied };
    db.prepare("UPDATE reviews SET reply_body = ?, reply_edited_at = ? WHERE id = ?").run(input.body.trim(), at, review.id);
    return { ok: true };
  });
}

const isAdmin = (db: Db, accountId: number) =>
  db.prepare("SELECT 1 FROM accounts WHERE id = ? AND is_admin = 1").get(accountId) !== undefined;

/** ผู้ดูแลแพลตฟอร์มซ่อนรีวิวที่ `แสดงอยู่` พร้อมเหตุผล (REV-016) */
export function hideReview(db: Db, input: { adminAccountId: number; reviewId: number; reason: string }, now: Date = new Date()): Outcome {
  return transaction(db, () => {
    const review = db.prepare("SELECT status FROM reviews WHERE id = ?").get(input.reviewId) as { status: ReviewStatus } | undefined;
    if (!review || !isAdmin(db, input.adminAccountId)) return NOT_FOUND;
    if (review.status === REVIEW_STATUS.hidden) return { ok: false, error: MESSAGES.alreadyHidden };
    const length = textLength(input.reason);
    if (length < 1 || length > LIMITS.hideReason) return { ok: false, error: MESSAGES.hideReason };
    db.prepare("UPDATE reviews SET status = ?, hidden_reason = ?, hidden_at = ?, hidden_by_account_id = ? WHERE id = ?").run(
      REVIEW_STATUS.hidden,
      input.reason.trim(),
      now.toISOString(),
      input.adminAccountId,
      input.reviewId,
    );
    onReviewHidden(db, input.reviewId, now);
    return { ok: true };
  });
}

/** ผู้ดูแลแพลตฟอร์มเลิกซ่อน รีวิวและคำตอบของร้านกลับมาแสดง เรียกซ้ำได้ (REV-016) */
export function unhideReview(db: Db, input: { adminAccountId: number; reviewId: number }): Outcome {
  if (!isAdmin(db, input.adminAccountId)) return NOT_FOUND;
  const found = db.prepare("UPDATE reviews SET status = ? WHERE id = ?").run(REVIEW_STATUS.visible, input.reviewId);
  return found.changes === 0 ? NOT_FOUND : { ok: true };
}

/** รีวิวหนึ่งรีวิวในรายการ author ถูกปิดบางส่วนแล้ว ยกเว้นในหน้าจัดการรีวิว */
export type ListedReview = {
  id: number;
  productId: number;
  productName: string;
  variantLabel: string;
  shopName: string;
  /** null ในรายการที่ทุกคนเห็น */
  orderNo: string | null;
  author: string;
  rating: number;
  body: string;
  images: string[];
  createdAt: string;
  edited: boolean;
  status: ReviewStatus;
  reply: Reply | null;
  hiddenReason: string | null;
  hiddenAt: string | null;
};

type ListedRow = ReviewRow & { display_name: string; product_name: string; variant_label: string; order_no: string; shop_name: string };

type Audience = "public" | "shop" | "admin";

/** รูปของหลายรีวิวในคำสั่งอ่านเดียว */
function imagesByReview(db: Db, reviewIds: number[]): Map<number, string[]> {
  const images = new Map<number, string[]>();
  if (reviewIds.length === 0) return images;
  const rows = db
    .prepare(`SELECT review_id, url FROM review_images WHERE review_id IN (${reviewIds.map(() => "?").join(", ")}) ORDER BY review_id, position`)
    .all(...reviewIds) as { review_id: number; url: string }[];
  for (const row of rows) images.set(row.review_id, [...(images.get(row.review_id) ?? []), row.url]);
  return images;
}

const countWhere = (db: Db, where: string, ...args: (string | number)[]) =>
  Number(db.prepare(`SELECT count(*) AS n FROM reviews r WHERE ${where}`).get(...args)?.n);

/** total คือจำนวนรีวิวที่ตรงกับ where หน้าที่ขอเกินหน้าสุดท้าย ได้หน้าสุดท้ายที่มีอยู่จริง (REV-007) */
function listReviews(db: Db, audience: Audience, where: string, args: (string | number)[], total: number, page: number, pageSize: number) {
  const totalPages = pageCount(total, pageSize);
  const shown = clampPage(page, totalPages);
  const rows = db
    .prepare(
      `SELECT r.*, a.display_name, i.product_name, i.variant_label, o.order_no, s.name AS shop_name
       FROM reviews r
       JOIN accounts a ON a.id = r.buyer_account_id
       JOIN order_items i ON i.id = r.order_item_id
       JOIN orders o ON o.id = i.order_id
       JOIN shops s ON s.id = r.shop_id
       WHERE ${where}
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...args, pageSize, (shown - 1) * pageSize) as ListedRow[];
  const images = imagesByReview(db, rows.map((row) => row.id));
  const reviews: ListedReview[] = rows.map((row) => ({
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    variantLabel: row.variant_label,
    shopName: row.shop_name,
    orderNo: audience === "public" ? null : row.order_no,
    author: audience === "admin" ? row.display_name : maskName(row.display_name),
    rating: row.rating,
    body: row.body,
    images: images.get(row.id) ?? [],
    createdAt: row.created_at,
    edited: row.edited_at !== null,
    status: row.status,
    reply: replyOf(row),
    hiddenReason: row.status === REVIEW_STATUS.hidden ? row.hidden_reason : null,
    hiddenAt: row.status === REVIEW_STATUS.hidden ? row.hidden_at : null,
  }));
  return { reviews, total, page: shown, totalPages };
}

/** รีวิวที่ `แสดงอยู่` ของสินค้า ล่าสุดก่อน หน้าละ 10 รีวิว กรองตามจำนวนดาวได้ (REV-007 REV-008) */
export function listProductReviews(db: Db, productId: number, options: { stars?: number | null; page?: number } = {}) {
  const where = ["r.product_id = ?", "r.status = ?"];
  const args: (string | number)[] = [productId, REVIEW_STATUS.visible];
  if (options.stars) {
    where.push("r.rating = ?");
    args.push(options.stars);
  }
  const filter = where.join(" AND ");
  return listReviews(db, "public", filter, args, countWhere(db, filter, ...args), options.page ?? 1, PRODUCT_REVIEWS_PAGE_SIZE);
}

const UNANSWERED = "r.shop_id = ? AND r.status = ? AND r.reply_body IS NULL";

/** รีวิวที่ `แสดงอยู่` ของร้านที่ยังไม่มีคำตอบของร้าน ตัวเลข "ยังไม่ตอบ" ตัวเดียวของทั้งระบบ (REV-014) */
export const countUnansweredReviews = (db: Db, shopId: number) => countWhere(db, UNANSWERED, shopId, REVIEW_STATUS.visible);

/** รีวิวของสินค้าในร้านนี้ทุกสถานะ ล่าสุดก่อน หน้าละ 20 รีวิว (REV-014) */
export function listShopReviews(db: Db, shopId: number, options: { unanswered?: boolean; page?: number } = {}) {
  const row = db
    .prepare("SELECT count(*) AS total, coalesce(sum(status = ? AND reply_body IS NULL), 0) AS unanswered FROM reviews WHERE shop_id = ?")
    .get(REVIEW_STATUS.visible, shopId);
  const counts = { all: Number(row?.total), unanswered: Number(row?.unanswered) };
  const list = options.unanswered
    ? listReviews(db, "shop", UNANSWERED, [shopId, REVIEW_STATUS.visible], counts.unanswered, options.page ?? 1, PAGE_SIZE)
    : listReviews(db, "shop", "r.shop_id = ?", [shopId], counts.all, options.page ?? 1, PAGE_SIZE);
  return { ...list, counts };
}

/** รีวิวของทุกร้านสำหรับหน้าจัดการรีวิว ล่าสุดก่อน หน้าละ 20 รีวิว ชื่อผู้ซื้อเป็นชื่อเต็ม (REV-016) */
export function listAllReviews(db: Db, options: { status?: ReviewStatus | null; page?: number } = {}) {
  const row = db.prepare("SELECT count(*) AS total, coalesce(sum(status = ?), 0) AS visible FROM reviews").get(REVIEW_STATUS.visible);
  const all = Number(row?.total);
  const visible = Number(row?.visible);
  const counts = { all, visible, hidden: all - visible };
  const list = options.status
    ? listReviews(db, "admin", "r.status = ?", [options.status], options.status === REVIEW_STATUS.visible ? visible : counts.hidden, options.page ?? 1, PAGE_SIZE)
    : listReviews(db, "admin", "1", [], all, options.page ?? 1, PAGE_SIZE);
  return { ...list, counts };
}
