import Link from "next/link";
import { SearchBar } from "@/features/browse/components/search-bar";
import { cartCount, cartLabel } from "@/features/cart/nav";
import { listCategories } from "@/features/product-listing/server/categories";
import { getDb } from "@/shared/db";
import { CartCount } from "@/shared/layout/cart-count";
import { HeaderMenu } from "@/shared/layout/header-menu";
import { headerLinks } from "@/shared/nav/registry";
import { getCurrentAccount } from "@/shared/session";
import { CART_TARGET } from "@/shared/ui/fly-to-cart";

/**
 * แถบนำทางด้านบนของทุกหน้า ลิงก์มาจาก nav.ts ของแต่ละ feature
 * ไอคอนตะกร้าอยู่นอกเมนูเพื่อให้เห็นตัวเลขทุกขนาดจอ ลิงก์อื่นอยู่ในเมนูบนจอเล็ก
 */
export async function SiteHeader() {
  const viewer = await getCurrentAccount();
  const count = cartCount(viewer);
  return (
    <header className="site-header">
      <nav aria-label="เมนูหลัก" className="container site-header-inner">
        <Link href="/" className="brand">
          <ParcelMark />
          Blanksong
        </Link>
        <SearchBar categories={listCategories(getDb())} />
        <Link href="/cart" className="header-icon-button" aria-label={cartLabel(count)} {...{ [CART_TARGET]: "" }}>
          <CartIcon />
          <CartCount count={count} />
        </Link>
        <HeaderMenu>
          <ul className="nav-list">
            {headerLinks(viewer).map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="nav-link">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </HeaderMenu>
      </nav>
    </header>
  );
}

/** กล่องพัสดุ ภาพประจำเว็บ */
function ParcelMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="m12 2 9 5v10l-9 5-9-5V7l9-5Z" />
      <path fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" d="m7.5 4.6 9 5v3.6" />
      <path fill="none" stroke="var(--color-bg)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" d="m3.6 7.4 8.4 4.7 8.4-4.7M12 12.1v9.3" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M2 3h3.2l.6 3H21l-1.9 9H7.6l.4 2H19v2H6.4L4.4 5H2V3Zm4.2 5 1 5h10.3l1-5H6.2ZM8 20.5a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm7 0a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Z"
      />
    </svg>
  );
}
