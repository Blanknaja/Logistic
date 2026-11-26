import Link from "next/link";
import { SearchBar } from "@/features/browse/components/search-bar";
import { cartCount, cartLabel } from "@/features/cart/nav";
import { NotificationBell } from "@/features/notification/components/notification-bell";
import { listCategories } from "@/features/product-listing/server/categories";
import { getDb } from "@/shared/db";
import { HeaderMenu } from "@/shared/layout/header-menu";
import { headerLinks } from "@/shared/nav/registry";
import { getCurrentAccount } from "@/shared/session";

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
          Blanksong
        </Link>
        <SearchBar categories={listCategories(getDb())} />
        <NotificationBell viewer={viewer} />
        <Link href="/cart" className="header-icon-button" aria-label={cartLabel(count)}>
          <CartIcon />
          {count > 0 && count}
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
