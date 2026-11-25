import Link from "next/link";
import { NotFoundState } from "@/shared/ui/states";

// คำสั่งซื้อที่ไม่มีอยู่และของบัญชีอื่นแสดงหน้าเดียวกัน (CHK-010)
export default function OrderNotFound() {
  return (
    <NotFoundState title="ไม่พบคำสั่งซื้อ">
      <Link href="/orders" className="button">
        กลับไปรายการคำสั่งซื้อ
      </Link>
    </NotFoundState>
  );
}
