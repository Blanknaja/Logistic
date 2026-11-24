import Link from "next/link";
import { deleteProductAction, setHiddenAction, type SavedNotice } from "@/features/product-listing/actions";
import type { ListedStatus, ShopProductRow } from "@/features/product-listing/server/products";
import { formatBaht, formatDateTime, formatNumber } from "@/shared/format";
import { PRODUCT_STATUS } from "@/shared/statuses";
import { EmptyState } from "@/shared/ui/states";
import { DeleteButton } from "./delete-button";
import styles from "./product-listing.module.css";

const LIST_PATH = "/seller/products";
const NEW_PATH = "/seller/products/new";

/** ค่า ?status= ของตัวกรอง เรียงตามที่แสดง */
const STATUS_FILTERS: Record<string, ListedStatus> = {
  onSale: PRODUCT_STATUS.onSale,
  hidden: PRODUCT_STATUS.hidden,
  draft: PRODUCT_STATUS.draft,
};

const NOTICES: Record<SavedNotice, string> = {
  published: "เปิดขายสินค้าแล้ว",
  draft: "บันทึกร่างแล้ว",
  saved: "บันทึกแล้ว",
  deleted: "ลบสินค้าแล้ว",
};

type Params = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);

/** อ่าน ?status= ?q= ?page= ?notice= ของหน้ารายการสินค้าของร้าน ค่าที่ไม่รู้จักถูกข้าม */
export function listParams(params: Params) {
  const statusKey = one(params.status);
  const noticeKey = one(params.notice);
  return {
    statusKey: statusKey && Object.hasOwn(STATUS_FILTERS, statusKey) ? statusKey : undefined,
    q: one(params.q)?.trim() ?? "",
    page: Number(one(params.page) ?? 1),
    notice: noticeKey && Object.hasOwn(NOTICES, noticeKey) ? NOTICES[noticeKey as SavedNotice] : undefined,
  };
}

export const statusOf = (statusKey: string | undefined) => (statusKey ? STATUS_FILTERS[statusKey] : undefined);

function href(query: { status?: string; q?: string; page?: number }): string {
  const search = new URLSearchParams();
  if (query.status) search.set("status", query.status);
  if (query.q) search.set("q", query.q);
  if (query.page && query.page > 1) search.set("page", String(query.page));
  const text = search.toString();
  return text ? `${LIST_PATH}?${text}` : LIST_PATH;
}

/** "฿250 - ฿290" หรือ "฿250" ถ้าทุกแบบย่อยราคาเดียวกัน */
export function priceRange(min: number | null, max: number | null): string {
  if (min === null || max === null) return "ยังไม่ตั้งราคา";
  return min === max ? formatBaht(min) : `${formatBaht(min)} - ${formatBaht(max)}`;
}

export function Notice({ text }: { text?: string }) {
  return text ? (
    <p role="status" className={styles.notice}>
      {text}
    </p>
  ) : null;
}

/** ร้านที่ยังไม่มีสินค้าเลย มีปุ่มเดียวคือเพิ่มสินค้า (PRD-001) */
export function NoProducts() {
  return (
    <EmptyState title="ร้านของคุณยังไม่มีสินค้า">
      <Link href={NEW_PATH} className="button">
        เพิ่มสินค้า
      </Link>
    </EmptyState>
  );
}

export function ProductList({
  counts,
  result,
  statusKey,
  q,
}: {
  counts: Record<"all" | ListedStatus, number>;
  result: { items: ShopProductRow[]; page: number; pageCount: number };
  statusKey?: string;
  q: string;
}) {
  const back = href({ status: statusKey, q, page: result.page });
  const chips = [
    { key: undefined, label: "ทั้งหมด", count: counts.all },
    ...Object.entries(STATUS_FILTERS).map(([key, status]) => ({ key, label: status, count: counts[status] })),
  ];

  return (
    <>
      <nav aria-label="กรองตามสถานะ">
        <ul className="chips">
          {chips.map((chip) => (
            <li key={chip.label}>
              <Link
                href={href({ status: chip.key, q })}
                className={chip.key === statusKey ? `chip ${styles.chipActive}` : "chip"}
                aria-current={chip.key === statusKey ? "page" : undefined}
              >
                {chip.label} {formatNumber(chip.count)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <form action={LIST_PATH} method="get" role="search" className={styles.search}>
        {statusKey && <input type="hidden" name="status" value={statusKey} />}
        <input type="search" name="q" defaultValue={q} className="input" placeholder="ค้นหาจากชื่อสินค้า" aria-label="ค้นหาจากชื่อสินค้า" />
        <button type="submit" className="button button-secondary">
          ค้นหา
        </button>
      </form>

      {result.items.length === 0 ? (
        q ? (
          <EmptyState title={`ไม่พบสินค้าที่ชื่อมีคำว่า ${q}`}>
            <Link href={href({ status: statusKey })} className="button button-secondary">
              ล้างคำค้นหา
            </Link>
          </EmptyState>
        ) : (
          <EmptyState title={`ไม่มีสินค้าสถานะ ${statusOf(statusKey)}`} />
        )
      ) : (
        <ul className={styles.list}>
          {result.items.map((item) => (
            <li key={item.id} className={`card ${styles.row}`}>
              {item.coverUrl ? (
                <img src={item.coverUrl} alt="" className={styles.thumb} loading="lazy" />
              ) : (
                <div className={styles.noImage}>ไม่มีรูป</div>
              )}
              <div>
                <p className={styles.rowName}>{item.name}</p>
                <p className={styles.meta}>
                  <span>{priceRange(item.minPrice, item.maxPrice)}</span>
                  <span>สต็อก {formatNumber(item.totalStock)}</span>
                  <span className={styles.status}>{item.status}</span>
                </p>
                <p className={styles.meta}>แก้ล่าสุด {formatDateTime(item.updatedAt)}</p>
              </div>
              <div className={styles.rowActions}>
                <Link href={`${LIST_PATH}/${item.id}`} className="button button-secondary">
                  แก้ไข
                </Link>
                {item.status !== PRODUCT_STATUS.draft && (
                  <form action={setHiddenAction.bind(null, item.id, item.status === PRODUCT_STATUS.onSale, back)}>
                    <button type="submit" className="button button-secondary">
                      {item.status === PRODUCT_STATUS.onSale ? "ซ่อน" : "เลิกซ่อน"}
                    </button>
                  </form>
                )}
                <DeleteButton name={item.name} action={deleteProductAction.bind(null, item.id)} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {result.pageCount > 1 && (
        <nav aria-label="เปลี่ยนหน้า" className={styles.pager}>
          {result.page > 1 ? (
            <Link href={href({ status: statusKey, q, page: result.page - 1 })} className="button button-secondary">
              หน้าก่อนหน้า
            </Link>
          ) : (
            <span />
          )}
          <span>
            หน้า {result.page} จาก {result.pageCount}
          </span>
          {result.page < result.pageCount ? (
            <Link href={href({ status: statusKey, q, page: result.page + 1 })} className="button button-secondary">
              หน้าถัดไป
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
