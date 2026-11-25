import Link from "next/link";
import { browseHref, hasCriteria, type BrowseParams } from "@/features/browse/search-params";
import type { SearchResult } from "@/features/browse/server/search";
import type { Category } from "@/features/product-listing/server/categories";
import { formatBaht, formatNumber } from "@/shared/format";
import { EmptyState } from "@/shared/ui/states";
import { FilterForm } from "./filter-form";
import { ProductImage } from "./product-image";
import styles from "./browse.module.css";

type Props = { params: BrowseParams; result: SearchResult; categories: Category[] };

/** หมวดหมู่ ตัวกรอง และรายการสินค้าของหน้าแรกกับหน้าผลการค้นหา */
export function BrowseResults({ params, result, categories }: Props) {
  return (
    <>
      <section aria-labelledby="categories-title">
        <h2 id="categories-title">หมวดหมู่</h2>
        <ul className="chips">
          {categories.map((category) => {
            const active = result.category?.id === category.id;
            return (
              <li key={category.id}>
                <Link
                  href={browseHref({ ...params, category: String(category.id), page: 1 })}
                  className={`chip ${styles.chipLink} ${active ? styles.chipActive : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  {category.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {result.categoryNotFound ? (
        <EmptyState title="ไม่พบหมวดหมู่นี้" message="เลือกหมวดหมู่ใหม่จากรายชื่อด้านบน" />
      ) : (
        <>
          <FilterForm key={browseHref(params)} params={params} initialError={result.priceError} />
          <Results params={params} result={result} />
        </>
      )}
    </>
  );
}

function Results({ params, result }: Omit<Props, "categories">) {
  if (result.total === 0 && !hasCriteria(params)) return <EmptyState title="ยังไม่มีสินค้าในตอนนี้" />;

  // ล้างตัวกรองคงคำค้นและการเรียงไว้
  const clearHref = browseHref({ q: params.q, sort: params.sort });
  const filtered = params.category !== null || params.min !== null || params.max !== null;

  return (
    <section aria-label="รายการสินค้า">
      <div className={styles.summary}>
        <p>พบ {formatNumber(result.total)} รายการ</p>
        {filtered && result.total > 0 && (
          <Link href={clearHref} className="button button-secondary">
            ล้างตัวกรอง
          </Link>
        )}
      </div>

      {result.total === 0 ? (
        <EmptyState title="ไม่พบสินค้าที่ตรงกับที่ค้นหา" message={params.q ? `คำค้น "${params.q}"` : undefined}>
          <Link href={clearHref} className="button button-secondary">
            ล้างตัวกรอง
          </Link>
          <Link href="/" className="button">
            กลับหน้าแรก
          </Link>
        </EmptyState>
      ) : (
        <>
          <ul className={styles.grid}>
            {result.items.map((item) => (
              <li key={item.id}>
                <Link href={`/products/${item.id}`} className={styles.card}>
                  <ProductImage src={item.coverUrl} alt="" />
                  <span className={styles.cardBody}>
                    <span className={styles.cardName}>{item.name}</span>
                    <span className={styles.priceText}>{formatBaht(item.price)}</span>
                    <span className={styles.muted}>{item.shopName}</span>
                    {item.soldOut && <span className={styles.soldOut}>สินค้าหมด</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Pagination params={params} page={result.page} totalPages={result.totalPages} />
        </>
      )}
    </section>
  );
}

function Pagination({ params, page, totalPages }: { params: BrowseParams; page: number; totalPages: number }) {
  if (totalPages <= 1) return null;
  const pageLink = (target: number, label: string) =>
    target >= 1 && target <= totalPages ? (
      <Link href={browseHref({ ...params, page: target })} className="button button-secondary">
        {label}
      </Link>
    ) : (
      <button type="button" className="button button-secondary" disabled>
        {label}
      </button>
    );

  return (
    <nav aria-label="เปลี่ยนหน้า" className={styles.pagination}>
      {pageLink(page - 1, "หน้าก่อนหน้า")}
      <span>
        หน้า {formatNumber(page)} จาก {formatNumber(totalPages)}
      </span>
      {pageLink(page + 1, "หน้าถัดไป")}
    </nav>
  );
}
