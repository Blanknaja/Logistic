import { countVisibleProducts } from "@/features/browse/server/catalog";
import { listCategories } from "@/features/product-listing/server/categories";
import { getDb } from "@/shared/db";
import { formatNumber } from "@/shared/format";
import { EmptyState } from "@/shared/ui/states";

export default function HomePage() {
  const db = getDb();
  const total = countVisibleProducts(db);
  const categories = listCategories(db);

  return (
    <>
      <h1>ซื้อของจากหลายร้านในที่เดียว</h1>
      <section aria-labelledby="categories">
        <h2 id="categories">หมวดหมู่</h2>
        <ul className="chips">
          {categories.map((category) => (
            <li key={category.id} className="chip">
              {category.name}
            </li>
          ))}
        </ul>
      </section>
      {total === 0 ? (
        <EmptyState title="ยังไม่มีสินค้าที่ขายอยู่" />
      ) : (
        <p>พบ {formatNumber(total)} รายการ</p>
      )}
    </>
  );
}
