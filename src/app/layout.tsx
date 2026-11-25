import type { Metadata } from "next";
import { Noto_Serif_Thai } from "next/font/google";
import { SiteHeader } from "@/shared/layout/site-header";
import "./globals.css";

// ทุกหน้าอ่านฐานข้อมูลตอนมีคนเปิด ไม่สร้างหน้าล่วงหน้าตอน build
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Blanksong", template: "%s | Blanksong" },
  description: "แพลตฟอร์มซื้อขายของออนไลน์ที่มีหลายร้านในที่เดียว",
};

const serif = Noto_Serif_Thai({
  subsets: ["thai", "latin"],
  weight: ["400", "700"],
  variable: "--font-serif",
});

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={serif.variable}>
      <body>
        <SiteHeader />
        <main className="container page">{children}</main>
      </body>
    </html>
  );
}
