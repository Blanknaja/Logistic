import type { Metadata } from "next";
import { Anuphan, Noto_Sans_Thai_Looped, Noto_Serif_Thai } from "next/font/google";
import { SiteHeader } from "@/shared/layout/site-header";
import "./globals.css";

// ทุกหน้าอ่านฐานข้อมูลตอนมีคนเปิด ไม่สร้างหน้าล่วงหน้าตอน build
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Blanksong", template: "%s | Blanksong" },
  description: "แพลตฟอร์มซื้อขายของออนไลน์ที่มีหลายร้านในที่เดียว",
};

// ไฟล์ variable ไฟล์เดียว เนื้อหาใช้น้ำหนัก 400 กับ 600 (docs/design-system.md)
const sans = Noto_Sans_Thai_Looped({
  subsets: ["thai", "latin"],
  variable: "--font-sans",
});

// ตัวไม่มีหัวสำหรับตัวโชว์ หัวเรื่อง และราคา ตัวมีหัวที่ขนาดใหญ่ดูเป็นเอกสาร
const show = Anuphan({
  subsets: ["thai", "latin"],
  variable: "--font-show",
});

// ตัวมีเชิงใช้กับคำว่า Blanksong ในโลโก้คำเดียว
const serif = Noto_Serif_Thai({
  subsets: ["latin"],
  weight: "600",
  variable: "--font-serif",
});

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={`${sans.variable} ${show.variable} ${serif.variable}`}>
      <body>
        <SiteHeader />
        <main className="container page">{children}</main>
      </body>
    </html>
  );
}
