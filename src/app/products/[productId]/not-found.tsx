import { NotFoundState } from "@/shared/ui/states";

// สินค้าที่ไม่มี ไม่ขายอยู่ หรือร้านถูกระงับ แสดงหน้าเดียวกันโดยไม่บอกเหตุผล (BRW-007 BRW-013)
export default function ProductNotFound() {
  return <NotFoundState title="ไม่พบสินค้านี้" />;
}
