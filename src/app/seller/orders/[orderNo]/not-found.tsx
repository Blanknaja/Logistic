import Link from "next/link";
import { ordersHref } from "@/features/shop-orders/paths";
import { EmptyState } from "@/shared/ui/states";

// คำสั่งซื้อของร้านอื่นกับเลขที่ไม่มีอยู่จริงเห็นหน้านี้เหมือนกันทุกตัวอักษร (ORD-012)
export default function OrderNotFound() {
  return (
    <EmptyState title="ไม่พบคำสั่งซื้อ">
      <Link href={ordersHref()} className="button">
        กลับไปหน้ารายการคำสั่งซื้อ
      </Link>
    </EmptyState>
  );
}
