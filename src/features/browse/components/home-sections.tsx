import Form from "next/form";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { browseHref, MAX_QUERY_LENGTH } from "@/features/browse/search-params";
import { BUDGET_MAX, type CategoryCover, type FeaturedShop, type HomeSections } from "@/features/browse/server/home";
import { ShopLogo } from "@/features/shop/components/shop-logo";
import { tintIndex } from "@/shared/category-icons";
import { formatBaht, formatNumber } from "@/shared/format";
import { ParcelStage } from "./parcel-stage";
import { ProductCard } from "./product-card";
import { ProductImage } from "./product-image";
import { RouteArt } from "./route-art";
import styles from "./home.module.css";

// ประโยคที่ตัวอ่านประโยคเข้าใจ (sentence.test.ts) ชวนให้ลองค้นหาแบบพิมพ์เป็นประโยค
const EXAMPLES = ["รองเท้าไม่เกิน 500 ถูกสุด", "เสื้อ 100 ถึง 300 บาท", "กระเป๋าถูกกว่า 500"];

const order = (i: number) => ({ "--i": i }) as CSSProperties;

/** ส่วนต้อนรับของหน้าแรก: ประโยคเดียว ช่องค้นหาใหญ่ และภาพพัสดุที่เดินทางจากร้านถึงบ้าน */
export function HomeHero() {
  return (
    <section className={styles.hero} aria-labelledby="home-title">
      <div className={styles.heroText}>
        <h1 id="home-title" className={`display ${styles.heroTitle}`}>
          <span className="rise">ซื้อของจากหลายร้าน</span>
          <span className={`rise ${styles.heroAccent}`} style={order(1)}>
            ในที่เดียว
          </span>
        </h1>
        <p className={`rise ${styles.heroLead}`} style={order(2)}>
          เลือกของจากร้านที่ชอบ จ่ายครั้งเดียว แล้วตามพัสดุได้ทุกชิ้น
        </p>
        <Form action="/" role="search" aria-label="ค้นหาจากส่วนต้อนรับ" className={styles.heroSearch}>
          <input
            type="search"
            name="q"
            maxLength={MAX_QUERY_LENGTH}
            enterKeyHint="search"
            className={`input ${styles.heroInput}`}
            aria-label="พิมพ์สิ่งที่อยากได้"
            placeholder="อยากได้อะไร พิมพ์เป็นประโยคได้"
          />
          <button type="submit" className={`button ${styles.heroButton}`}>
            หาเลย
          </button>
        </Form>
        <ul className={styles.examples} aria-label="ตัวอย่างประโยคค้นหา">
          {EXAMPLES.map((text) => (
            <li key={text}>
              <Link href={browseHref({ q: text })} className={styles.example}>
                {text}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <ParcelStage />
    </section>
  );
}

/** หมวดหมู่เป็นการ์ดรูปบนพื้นสีอ่อน แถวเดียวที่เลื่อนซ้ายขวา */
export function CategoryCards({ categories }: { categories: CategoryCover[] }) {
  return (
    <nav aria-label="หมวดหมู่" className={styles.scroller}>
      <ul className={styles.categoryRow}>
        {categories.map((category) => (
          <li key={category.id}>
            <Link
              href={browseHref({ category: String(category.id) })}
              className={`lift ${styles.categoryCard} ${styles[`tint${tintIndex(category.id)}`]}`}
            >
              <ProductImage src={category.coverUrl} alt="" categoryId={category.id} />
              <span className={styles.categoryName}>{category.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function ShelfHeader({ id, title, more }: { id: string; title: string; more?: ReactNode }) {
  return (
    <div className={styles.shelfHeader}>
      <h2 id={id}>{title}</h2>
      {more}
    </div>
  );
}

const Arrow = () => (
  <svg className={styles.arrow} viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
    <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
  </svg>
);

/** ชั้นสินค้าราคาไม่เกิน BUDGET_MAX เลื่อนซ้ายขวา */
export function BudgetShelf({ items }: { items: HomeSections["budget"] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="shelf-budget" className={styles.shelf}>
      <ShelfHeader
        id="shelf-budget"
        title={`ราคาเบาๆ ไม่เกิน ${formatBaht(BUDGET_MAX)}`}
        more={
          <Link href={browseHref({ max: BUDGET_MAX })} className={`link-action ${styles.more}`}>
            ดูทั้งหมด
            <Arrow />
          </Link>
        }
      />
      <div className={styles.scroller}>
        <ul className={styles.productRow}>
          {items.map((item) => (
            <li key={item.id}>
              <ProductCard item={item} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** ร้านที่มีสินค้ามากที่สุด โลโก้ ชื่อ และรูปสินค้าล่าสุด 3 ชิ้น */
export function ShopShelf({ shops }: { shops: FeaturedShop[] }) {
  if (shops.length === 0) return null;
  return (
    <section aria-labelledby="shelf-shops" className={styles.shelf}>
      <ShelfHeader id="shelf-shops" title="ร้านเด่น" />
      <div className={styles.scroller}>
        <ul className={styles.shopRow}>
          {shops.map((shop) => (
            <li key={shop.id}>
              <Link href={`/shops/${shop.id}`} className={`card lift ${styles.shopCard}`}>
                <span className={styles.shopHead}>
                  <ShopLogo name={shop.name} logoUrl={shop.logoUrl} />
                  <span className={styles.shopText}>
                    <span className={styles.shopName}>{shop.name}</span>
                    <span className={styles.shopCount}>สินค้า {formatNumber(shop.productCount)} ชิ้น</span>
                  </span>
                </span>
                <span className={styles.shopCovers}>
                  {shop.covers.map((url) => (
                    <ProductImage key={url} src={url} alt="" />
                  ))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** แถบพื้นเข้มหนึ่งแถบของหน้าแรก บอกจุดขายของแพลตฟอร์ม กล่องเดินตามเส้นประขณะเลื่อนหน้า */
export function TrackBand() {
  return (
    <section className={styles.band} aria-labelledby="band-title">
      <div className={styles.bandText}>
        <h2 id="band-title">ซื้อจากหลายร้าน ตามพัสดุได้ทุกชิ้น</h2>
        <p>ทุกคำสั่งซื้อมีเลขติดตามพัสดุ ดูได้ว่าของอยู่จังหวัดไหนตั้งแต่ออกจากร้านจนถึงบ้าน</p>
        <Link href="/track" className={`button button-secondary ${styles.bandButton}`}>
          ติดตามพัสดุ
          <Arrow />
        </Link>
      </div>
      <RouteArt travel="scroll" className={styles.bandArt} />
    </section>
  );
}
