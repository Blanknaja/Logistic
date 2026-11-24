import Link from "next/link";
import { headerLinks } from "@/shared/nav/registry";
import { getCurrentAccount } from "@/shared/session";

/** แถบนำทางด้านบนของทุกหน้า ลิงก์มาจาก nav.ts ของแต่ละ feature */
export async function SiteHeader() {
  const links = headerLinks(await getCurrentAccount());
  return (
    <header className="site-header">
      <div className="container site-header-inner">
        <Link href="/" className="brand">
          Blanksong
        </Link>
        <nav aria-label="เมนูหลัก">
          <ul className="nav-list">
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="nav-link">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
