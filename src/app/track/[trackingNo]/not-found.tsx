import { PARCEL_NOT_FOUND } from "@/features/delivery/server/tracking";
import { NotFoundState } from "@/shared/ui/states";

// ไม่มีพัสดุเลขนี้ และไม่มีสิทธิ์ดู แสดงหน้าเดียวกันโดยไม่บอกเหตุผล (DLV-010)
export default function ParcelNotFound() {
  return <NotFoundState title={PARCEL_NOT_FOUND} />;
}
