import { categoryIconPath, tintIndex } from "@/shared/category-icons";

const FILE_NAME = /^[a-z0-9-]+\.svg$/;

// ไฟล์รูปอ่านตัวแปรของ CSS ไม่ได้ ค่าสีจึงซ้ำกับ --tint-1 ถึง --tint-4 และ --color-ink ใน globals.css
const TINTS = ["#dff3e6", "#fde9c8", "#ffe1d6", "#dcecfb"];
const INK = "#0f3d2e";
const SHOP = "M4 10h16v10H4V10Zm-1 0 2-6h14l2 6M9 20v-5h6v5";

/**
 * รูปแทนสินค้าและโลโก้ของข้อมูลตัวอย่าง สร้างจากชื่อไฟล์ ไม่ต้องมีไฟล์จริงและไม่ดึงรูปจากเว็บอื่น
 * สินค้าได้ไอคอนของหมวดจากท้ายชื่อ เช่น s12-1-c3.svg โลโก้ร้านได้รูปหน้าร้าน
 * คืน null ถ้าชื่อไฟล์ไม่ใช่รูปแบบที่ข้อมูลตัวอย่างใช้
 */
export function sampleImageSvg(fileName: string): string | null {
  if (!FILE_NAME.test(fileName)) return null;
  let hash = 0;
  for (const char of fileName) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const category = /-c(\d+)\.svg$/.exec(fileName);
  const icon = fileName.startsWith("shop") ? SHOP : categoryIconPath(category ? Number(category[1]) : null);
  const tint = TINTS[tintIndex(category ? Number(category[1]) : hash) - 1];
  const glow = TINTS[tintIndex(hash >>> 3) - 1];
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">`,
    `<rect width="600" height="600" fill="${tint}"/>`,
    `<circle cx="${120 + (hash % 360)}" cy="${140 + ((hash >>> 9) % 320)}" r="${150 + ((hash >>> 5) % 90)}" fill="${glow}" opacity="0.55"/>`,
    `<g transform="translate(180 180) scale(10)" fill="none" stroke="${INK}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">`,
    `<path d="${icon}"/>`,
    `</g>`,
    `</svg>`,
  ].join("");
}
