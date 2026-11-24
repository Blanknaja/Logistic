import type { CurrentAccount } from "@/features/account/server/sessions";

/** ลิงก์ในแถบนำทางด้านบนของทุกหน้า */
export type HeaderLink = {
  label: string;
  href: string;
  /** น้อยอยู่ซ้าย ดูเลขที่จองไว้ของแต่ละ feature ใน docs/architecture.md */
  order: number;
  /** ไม่ใส่ = ทุกคนเห็น viewer เป็น null เมื่อยังไม่เข้าสู่ระบบ */
  visibleTo?: (viewer: CurrentAccount | null) => boolean;
};

/** ลิงก์ในเมนูหลังบ้านของร้าน */
export type SellerMenuLink = {
  label: string;
  /** ใส่ฟังก์ชันเมื่อที่อยู่ต้องมีเลขร้าน เช่น หน้าร้านของตัวเอง */
  href: string | ((shopId: number) => string);
  order: number;
};

/** ลิงก์ทั้งหมดของหนึ่ง feature อยู่ในไฟล์ src/features/<feature>/nav.ts */
export type FeatureNav = {
  header: HeaderLink[];
  sellerMenu: SellerMenuLink[];
};
