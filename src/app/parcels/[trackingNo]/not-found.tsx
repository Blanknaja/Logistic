import { NotFoundState } from "@/shared/ui/states";

// พัสดุที่ไม่มีอยู่ และพัสดุที่คนดูไม่มีสิทธิ์เปลี่ยนสถานะ แสดงหน้าเดียวกัน (DLV-002 DLV-010)
export default function ParcelNotFound() {
  return <NotFoundState title="ไม่พบพัสดุนี้" />;
}
