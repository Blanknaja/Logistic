import Link from "next/link";
import { NotFoundState } from "@/shared/ui/states";

// สินค้าที่ถูกลบ ไม่มีอยู่ และเป็นของร้านอื่น เห็นหน้าเดียวกัน (PRD-006 PRD-012)
export default function ProductNotFound() {
  return (
    <NotFoundState title="ไม่พบสินค้านี้">
      <Link href="/seller/products" className="button">
        กลับไปรายการสินค้า
      </Link>
    </NotFoundState>
  );
}
