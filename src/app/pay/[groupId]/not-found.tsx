import { NotFoundState } from "@/shared/ui/states";

// กลุ่มที่ไม่มีอยู่กับกลุ่มของบัญชีอื่นแสดงหน้าเดียวกัน ไม่บอกยอดหรือชื่อร้าน (PAY-014)
export default function PayNotFound() {
  return <NotFoundState title="ไม่พบหน้านี้" />;
}
