const FILE_NAME = /^[a-z0-9-]+\.svg$/;

/**
 * รูปแทนสินค้าและโลโก้ของข้อมูลตัวอย่าง สร้างจากชื่อไฟล์ ไม่ต้องมีไฟล์จริงและไม่ดึงรูปจากเว็บอื่น
 * คืน null ถ้าชื่อไฟล์ไม่ใช่รูปแบบที่ข้อมูลตัวอย่างใช้
 */
export function sampleImageSvg(fileName: string): string | null {
  if (!FILE_NAME.test(fileName)) return null;
  let hash = 0;
  for (const char of fileName) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">`,
    `<rect width="600" height="600" fill="hsl(${hue} 55% 88%)"/>`,
    `<circle cx="300" cy="260" r="120" fill="hsl(${hue} 45% 62%)"/>`,
    `<rect x="150" y="420" width="300" height="36" rx="18" fill="hsl(${hue} 45% 62%)"/>`,
    `</svg>`,
  ].join("");
}
