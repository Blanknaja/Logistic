import Link from "next/link";
import { RefreshOnNavigate } from "@/shared/layout/refresh-on-navigate";
import { sellerMenuLinks } from "@/shared/nav/registry";

/** เมนูหลังบ้านของร้าน ลิงก์มาจาก sellerMenu ใน nav.ts ของแต่ละ feature */
export function SellerMenu({ shopId }: { shopId: number }) {
  return (
    <nav aria-label="เมนูหลังบ้านของร้าน">
      <RefreshOnNavigate />
      <ul className="nav-list seller-menu">
        {sellerMenuLinks(shopId).map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="nav-link">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
