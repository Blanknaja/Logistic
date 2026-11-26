import { NotFoundState } from "@/shared/ui/states";

// บัญชีที่ไม่ใช่ผู้ดูแลแพลตฟอร์มเห็นหน้าเดียวกับหน้าที่ไม่มีอยู่ (REV-016)
export default function AdminNotFound() {
  return <NotFoundState title="ไม่พบหน้านี้" />;
}
