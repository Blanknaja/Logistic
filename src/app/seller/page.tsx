import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShopLogo } from "@/features/shop/components/shop-logo";
import styles from "@/features/shop/components/shop.module.css";
import { requireShop } from "@/features/shop/require-shop";
import { countShopProducts, getShopSummary } from "@/features/shop/server/shops";
import { orderHref, ordersHref } from "@/features/shop-orders/paths";
import { countOrdersAwaitingPacking, listShopOrders, UNCOUNTED } from "@/features/shop-orders/server/orders";
import { listStock } from "@/features/stock/server/stock";
import { getDb } from "@/shared/db";
import { formatBaht, formatNumber, formatThaiDateTime } from "@/shared/format";
import { ORDER_STATUS } from "@/shared/statuses";
import { RetryButton } from "@/shared/ui/retry-button";
import { EmptyState } from "@/shared/ui/states";
import { StatusBadge } from "@/shared/ui/status-badge";
import { PageReveal } from "@/shared/ui/transitions";

export const metadata: Metadata = { title: "หลังบ้านของร้าน" };

const NOTICES: Record<string, string> = { opened: "เปิดร้านสำเร็จ", "has-shop": "คุณมีร้านอยู่แล้ว" };

/** นับไม่ได้ได้ null ส่วนอื่นของหน้ายังต้องใช้ได้ (SHP-006) */
function countOrNull<T>(count: () => T): T | null {
  try {
    return count();
  } catch (error) {
    console.error(error);
    return null;
  }
}

/** จำนวนรายการที่ยกมาให้ทำต่อจากหน้าแรกของหลังบ้านต่อหนึ่งเรื่อง */
const TODO_LIMIT = 3;

/**
 * หน้าแรกของหลังบ้าน ตัวเลขที่ผู้ขายต้องทำต่อขึ้นก่อน แต่ละตัวพาไปรายการที่ใช้จัดการเรื่องนั้น
 * ทางเข้าอื่นอยู่ในเมนูหลังบ้านของ layout (SHP-006)
 */
export default async function SellerHomePage({ searchParams }: PageProps<"/seller">) {
  const viewer = await requireShop("/seller");
  const db = getDb();
  const shop = getShopSummary(db, viewer.shopId);
  if (!shop) notFound();
  const products = countShopProducts(db, shop.id);
  const stock = countOrNull(() => listStock(db, shop.id).counts);
  const numbers = [
    { label: "คำสั่งซื้อที่รอร้านจัดของ", href: ordersHref({ status: "paid" }), value: countOrNull(() => countOrdersAwaitingPacking(db, shop.id)) },
    { label: "สต็อกใกล้หมด", href: "/seller/stock?filter=low", value: stock?.low ?? null },
    { label: "สต็อกหมด", href: "/seller/stock?filter=out", value: stock?.out ?? null },
    { label: "สินค้าที่ขายอยู่", href: "/seller/products", value: products.onSale },
  ];
  // งานที่รออยู่ยกมาให้กดได้เลย ดึงไม่ได้ก็แค่ไม่มีรายการ ตัวเลขข้างบนยังบอกว่าโหลดไม่สำเร็จ
  const toPack =
    countOrNull(() => listShopOrders(db, shop.id, { status: ORDER_STATUS.paid, q: "", page: 1, asOf: null }).items)?.slice(0, TODO_LIMIT) ?? [];
  const lowStock = countOrNull(() => listStock(db, shop.id, { filter: "low" }).rows)?.slice(0, TODO_LIMIT) ?? [];
  const { notice } = await searchParams;
  const noticeText = typeof notice === "string" && Object.hasOwn(NOTICES, notice) ? NOTICES[notice] : null;

  return (
    <PageReveal>
      <>
        {noticeText && (
          <p role="status" className="notice">
            {noticeText}
          </p>
        )}
        <header className={styles.identity}>
          <ShopLogo name={shop.name} logoUrl={shop.logoUrl} />
          <div>
            <h1>{shop.name}</h1>
            <p className={styles.meta}>
              สถานะร้าน <StatusBadge status={shop.status} />
            </p>
          </div>
        </header>
        <dl className={styles.stats}>
          {numbers.map((number) => (
            <div
              key={number.label}
              className={`card lift ${styles.stat}`}
              data-waiting={number.href.includes("status=paid") && number.value ? "" : undefined}
            >
              <dt>
                <Link href={number.href} className={styles.statLink}>
                  {number.label}
                </Link>
              </dt>
              <dd>
                {number.value === null ? UNCOUNTED : formatNumber(number.value)}
                {number.value === null && (
                  <span className={styles.statError} role="alert">
                    โหลดไม่สำเร็จ
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
        {/* ปุ่มเดียวโหลดทุกตัวเลขใหม่ และเป็นปุ่มรองเมื่อมีปุ่ม "ลงสินค้าชิ้นแรก" หน้าจึงมีปุ่มสีเน้นไม่เกินหนึ่งปุ่ม */}
        {numbers.some((number) => number.value === null) && <RetryButton secondary={products.listed === 0} />}
        {(toPack.length > 0 || lowStock.length > 0) && (
          <section className={styles.todo} aria-labelledby="seller-todo">
            <h2 id="seller-todo">ต้องทำตอนนี้</h2>
            <div className={styles.todoColumns}>
              {toPack.length > 0 && (
                <ul className={`card ${styles.todoList}`} aria-label="คำสั่งซื้อที่รอจัดของ">
                  {toPack.map((order) => (
                    <li key={order.orderNo}>
                      <Link href={orderHref(order.orderNo, { status: "paid" })} className={styles.todoLink}>
                        <span>
                          จัดของให้ {order.recipientName}
                          <span className={styles.muted}>
                            {formatNumber(order.itemCount)} ชิ้น · {formatBaht(order.total)} · สั่งเมื่อ {formatThaiDateTime(order.orderedAt)}
                          </span>
                        </span>
                        <StatusBadge status={order.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {lowStock.length > 0 && (
                <ul className={`card ${styles.todoList}`} aria-label="สต็อกใกล้หมด">
                  {lowStock.map((row) => (
                    <li key={row.variantId}>
                      <Link href="/seller/stock?filter=low" className={styles.todoLink}>
                        <span>
                          เติมสต็อก {row.productName}
                          {row.variantLabel && <span className={styles.muted}>{row.variantLabel}</span>}
                        </span>
                        <span className="badge badge-wait">เหลือ {formatNumber(row.stock)} ชิ้น</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}
        {products.listed === 0 && (
          <EmptyState art="shop" title="ร้านของคุณยังไม่มีสินค้า">
            <Link href="/seller/products/new" className="button">
              ลงสินค้าชิ้นแรก
            </Link>
          </EmptyState>
        )}
      </>
    </PageReveal>
  );
}
