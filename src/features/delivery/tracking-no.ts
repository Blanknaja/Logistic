/** " bs0000000123 " → "BS0000000123" หรือ null ถ้ารูปแบบผิด ใช้ทั้งฝั่งเซิร์ฟเวอร์และในเบราว์เซอร์ */
export function parseTrackingNo(input: string): string | null {
  const value = input.trim().toUpperCase();
  return /^BS[0-9]{10}$/.test(value) ? value : null;
}
