import Link from "next/link";
import { PARCEL_NOT_FOUND } from "@/features/delivery/server/tracking";
import { EmptyState } from "@/shared/ui/states";

/**
 * ไม่มีพัสดุเลขนี้ และไม่มีสิทธิ์ดูหรือเปลี่ยนสถานะ แสดงหน้าเดียวกันโดยไม่บอกเหตุผล (DLV-002 DLV-010)
 * ทางไปต่อคือค้นหาเลขอื่น เพราะคนที่มาถึงหน้านี้ส่วนใหญ่พิมพ์หรือคัดลอกเลขมาผิด
 */
export function ParcelNotFound() {
  return (
    <EmptyState title={PARCEL_NOT_FOUND} message="ตรวจเลขติดตามพัสดุอีกครั้ง">
      <Link href="/track" className="button">
        ค้นหาพัสดุอื่น
      </Link>
    </EmptyState>
  );
}
