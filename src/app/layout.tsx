import type { Metadata } from "next";
import { SiteHeader } from "@/shared/layout/site-header";
import "./globals.css";

// ทุกหน้าอ่านฐานข้อมูลตอนมีคนเปิด ไม่สร้างหน้าล่วงหน้าตอน build
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Blanksong", template: "%s | Blanksong" },
  description: "แพลตฟอร์มซื้อขายของออนไลน์ที่มีหลายร้านในที่เดียว",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th">
      <body>
        <SiteHeader />
        <main className="container page">{children}</main>
      </body>
    </html>
  );
}
