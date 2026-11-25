import Link from "next/link";
import { browseHref, hasCriteria, type BrowseParams } from "@/features/browse/search-params";
import type { SearchResult } from "@/features/browse/server/search";
import type { Category } from "@/features/product-listing/server/categories";
import { formatBaht, formatNumber } from "@/shared/format";
import { EmptyState } from "@/shared/ui/states";
import { FilterForm } from "./filter-form";
import { ProductCard } from "./product-card";
import styles from "./browse.module.css";

type Props = { params: BrowseParams; result: SearchResult; categories: Category[] };

/** หมวดหมู่ ตัวกรอง และรายการสินค้าของหน้าแรกกับหน้าผลการค้นหา สินค้าเริ่มในจอแรก */
export function BrowseResults({ params, result, categories }: Props) {
  return (
    <>
      <h1 className="visually-hidden">ซื้อของจากหลายร้านในที่เดียว</h1>
      <nav aria-label="หมวดหมู่" className={styles.categories}>
        <ul className="chips">
          {categories.map((category) => {
            const active = result.category?.id === category.id;
            return (
              <li key={category.id}>
                <Link
                  href={browseHref({ ...params, category: String(category.id), page: 1 })}
                  className={`chip ${styles.chipLink}`}
                  aria-current={active ? "page" : undefined}
                >
                  {category.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {result.categoryNotFound ? (
        <EmptyState title="ไม่พบหมวดหมู่นี้" message="เลือกหมวดหมู่ใหม่จากรายชื่อด้านบน" />
      ) : (
        <Results params={params} result={result} />
      )}
    </>
  );
}

/** ตัวกรองที่ใช้อยู่ เป็นคำสั้นๆ ช่วงราคาที่ผิดไม่ได้ถูกใช้กรอง จึงไม่บอก */
function activeFilters(params: BrowseParams, result: SearchResult): string[] {
  const active = result.category ? [result.category.name] : [];
  const { min, max } = result.priceError ? { min: null, max: null } : params;
  if (min !== null && max !== null) active.push(`ราคา ${formatBaht(min)} ถึง ${formatBaht(max)}`);
  else if (min !== null) active.push(`ราคาตั้งแต่ ${formatBaht(min)}`);
  else if (max !== null) active.push(`ราคาไม่เกิน ${formatBaht(max)}`);
  return active;
}

function Results({ params, result }: Omit<Props, "categories">) {
  if (result.total === 0 && !hasCriteria(params)) return <EmptyState title="ยังไม่มีสินค้าในตอนนี้" />;

  // ล้างตัวกรองคงคำค้นและการเรียงไว้
  const clearHref = browseHref({ q: params.q, sort: params.sort });
  const filtered = params.category !== null || params.min !== null || params.max !== null;
  const active = activeFilters(params, result);

  return (
    <section aria-label="รายการสินค้า">
      <div className={styles.toolbar}>
        <div className={styles.count}>
          <p>
            พบ {formatNumber(result.total)} รายการ{params.q && ` สำหรับ "${params.q}"`}
          </p>
          {filtered && result.total > 0 && (
            <p className={styles.active}>
              {active.length > 0 && <span>{active.join(" · ")}</span>}
              <Link href={clearHref} className="link-action">
                ล้างตัวกรอง
              </Link>
            </p>
          )}
        </div>
        <FilterForm key={browseHref(params)} params={params} initialError={result.priceError} />
      </div>

      {result.total === 0 ? (
        <EmptyState title="ไม่พบสินค้าที่ตรงกับที่ค้นหา" message={filtered ? undefined : "ลองคำที่สั้นลง หรือคำอื่น"}>
          {/* ถ้ามีแค่คำค้น ล้างตัวกรองได้ผลเดิม จึงพาไปดูสินค้าทั้งหมดแทน */}
          {filtered ? (
            <Link href={clearHref} className="button">
              ล้างตัวกรอง
            </Link>
          ) : (
            <Link href="/" className="button">
              ดูสินค้าทั้งหมด
            </Link>
          )}
        </EmptyState>
      ) : (
        <>
          <ul className={styles.grid}>
            {result.items.map((item) => (
              <li key={item.id}>
                <ProductCard item={item} />
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
