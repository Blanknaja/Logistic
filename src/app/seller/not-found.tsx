import { NotFoundState } from "@/shared/ui/states";

// ข้อมูลที่ไม่มีอยู่หรือเป็นของร้านอื่น แสดงหน้าเดียวกัน (SHP-015)
export default function SellerNotFound() {
  return <NotFoundState title="ไม่พบหน้านี้" />;
}
