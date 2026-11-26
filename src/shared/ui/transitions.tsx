import { ViewTransition, type ReactNode } from "react";

// การเปลี่ยนหน้าและการโผล่ของข้อมูล ชื่อ class ตรงกับกฎ ::view-transition-* ใน globals.css
// เบราว์เซอร์ที่ไม่รองรับแสดงหน้าปกติโดยไม่ขยับ

/** ชื่อของรูปสินค้าชิ้นเดียวกันในการ์ดกับในหน้าสินค้า รูปจึงขยายจากการ์ดเป็นรูปใหญ่ */
export const productImageName = (productId: number) => `product-image-${productId}`;

/** ของชิ้นเดียวกันในสองหน้า ย้ายที่และเปลี่ยนขนาดแทนการหายแล้วโผล่ ชื่อต้องไม่ซ้ำกันในหน้าเดียว */
export function Morph({ name, children }: { name: string; children: ReactNode }) {
  return (
    <ViewTransition name={name} share="morph" default="none">
      {children}
    </ViewTransition>
  );
}

/** เนื้อหาของหน้าที่เลื่อนขึ้นและชัดขึ้นเมื่อข้อมูลมา ใช้ครอบเนื้อหาใน page.tsx */
export function PageReveal({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="slide-up" default="none">
      {children}
    </ViewTransition>
  );
}

/** โครงสีที่เลื่อนลงและจางเมื่อข้อมูลมา ใช้ครอบโครงสีใน loading.tsx */
export function SkeletonExit({ children }: { children: ReactNode }) {
  return (
    <ViewTransition exit="slide-down" default="none">
      {children}
    </ViewTransition>
  );
}

/**
 * หน้าในเส้นทางที่มีลำดับ เช่น ตะกร้า สั่งซื้อ จ่ายเงิน ลิงก์ที่เดินหน้าใส่ transitionTypes={["nav-forward"]}
 * ลิงก์ที่ย้อนใส่ ["nav-back"] เนื้อหาจึงเลื่อนเข้าจากขวาหรือซ้าย
 */
export function PageSlide({ children }: { children: ReactNode }) {
  const directions = { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" };
  return (
    <ViewTransition enter={directions} exit={directions} default="none">
      {children}
    </ViewTransition>
  );
}
