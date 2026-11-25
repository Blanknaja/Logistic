/** ข้อความที่หน้าเข้าสู่ระบบแสดงตาม ?notice= */
export const LOGIN_NOTICE = {
  relogin: "กรุณาเข้าสู่ระบบอีกครั้ง",
  suspended: "บัญชีนี้ถูกระงับ กรุณาติดต่อผู้ดูแลแพลตฟอร์ม",
  "password-reset": "ตั้งรหัสผ่านใหม่แล้ว กรุณาเข้าสู่ระบบ",
} as const;

export type LoginNotice = keyof typeof LOGIN_NOTICE;

export function isLoginNotice(value: unknown): value is LoginNotice {
  return typeof value === "string" && Object.hasOwn(LOGIN_NOTICE, value);
}

/** รับเฉพาะที่อยู่ในเว็บนี้ เช่น /cart กัน ?next= พาไปเว็บอื่น ค่าอื่นได้หน้าแรก */
export function safeNextPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\s]/.test(value)) return "/";
  return value;
}

/** ที่อยู่หน้าเข้าสู่ระบบที่พากลับมา next หลังเข้าสู่ระบบสำเร็จ */
export function loginPath(next: string, notice?: LoginNotice): string {
  const params = new URLSearchParams({ next: safeNextPath(next) });
  if (notice) params.set("notice", notice);
  return `/login?${params}`;
}
