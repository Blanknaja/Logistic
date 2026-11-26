// กฎของรีวิวที่ใช้ทั้งฝั่งเซิร์ฟเวอร์และในเบราว์เซอร์ (REV)

export const LIMITS = {
  body: 500,
  images: 3,
  imageBytes: 5 * 1024 * 1024,
  reply: 500,
  hideReason: 200,
} as const;

/** แก้รีวิวได้ก่อนครบ 7 วันนับจากเวลาที่ส่งครั้งแรก (REV-004) */
export const EDIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const IMAGE_TYPES = ["image/jpeg", "image/png"] as const;

/** รายการรีวิวบนหน้ารายละเอียดสินค้าแสดงหน้าละ 10 รีวิว (REV-007) */
export const PRODUCT_REVIEWS_PAGE_SIZE = 10;

export const MESSAGES = {
  rating: "เลือกคะแนน 1 ถึง 5 ดาว",
  body: "ข้อความยาวได้ไม่เกิน 500 ตัวอักษร",
  imageTooLarge: "รูปต้องมีขนาดไม่เกิน 5 MB",
  tooManyImages: "ใส่รูปได้ไม่เกิน 3 รูป",
  imageWrongType: "ใช้ได้เฉพาะรูป JPG หรือ PNG",
  uploadFailed: "ส่งรูปไม่สำเร็จ",
  tooManyUnusedUploads: "ส่งรูปที่ยังไม่ได้ใช้ในรีวิวมากเกินไป กรุณาลองใหม่ในวันถัดไป",
  sent: "ส่งรีวิวแล้ว",
  saved: "บันทึกรีวิวแล้ว",
  alreadyReviewed: "รายการนี้รีวิวไปแล้ว",
  notCompleted: "รีวิวได้หลังคำสั่งซื้อสำเร็จ",
  orderNotFound: "ไม่พบคำสั่งซื้อ",
  editExpired: "แก้รีวิวได้ภายใน 7 วันหลังส่ง",
  hidden: "รีวิวนี้ถูกซ่อนโดยผู้ดูแลแพลตฟอร์ม แก้หรือตอบไม่ได้",
  hiddenBadge: "ถูกซ่อนโดยผู้ดูแลแพลตฟอร์ม",
  reply: "กรอกคำตอบ 1 ถึง 500 ตัวอักษร",
  alreadyReplied: "รีวิวนี้มีคำตอบของร้านแล้ว",
  hideReason: "กรอกเหตุผล 1 ถึง 200 ตัวอักษร",
  alreadyHidden: "รีวิวนี้ถูกซ่อนแล้ว",
  noReviews: "ยังไม่มีรีวิว",
  loadFailed: "โหลดรีวิวไม่สำเร็จ",
  saveFailed: "บันทึกไม่สำเร็จ",
} as const;

/** จำนวนตัวอักษรตามที่ผู้ใช้เห็น ไม่นับช่องว่างหน้าหลัง */
export const textLength = (value: string) => [...value.trim()].length;

/** คะแนนเฉลี่ยที่แสดงและจำนวนรีวิวที่ `แสดงอยู่` */
export type Rating = { average: number; count: number };

/** คะแนนเฉลี่ยคูณ 10 ที่ปัดทศนิยมตำแหน่งที่สองแบบ 5 ปัดขึ้น คิดด้วยจำนวนเต็ม 4.25 จึงได้ 43 เสมอ (REV-006) */
export const averageTenths = (sum: number, count: number) => Math.floor((sum * 20 + count) / (2 * count));

export const displayedAverage = (sum: number, count: number) => averageTenths(sum, count) / 10;

/** 4 → "4.0" */
export const formatAverage = (average: number) => average.toFixed(1);

/** "สมหญิง" → "ส***" (REV-007) */
export const maskName = (displayName: string) => `${[...displayName.trim()][0] ?? ""}***`;

/** ตัวกรองคะแนนขั้นต่ำเป็นคำ: 5 ได้ "5 ดาว" ค่าอื่นได้ "4 ดาวขึ้นไป" (REV-011) */
export const minRatingLabel = (stars: number) => (stars >= 5 ? "5 ดาว" : `${stars} ดาวขึ้นไป`);

/** จำนวนดาว 1 ถึง 5 จากที่อยู่หน้าเว็บ ค่าอื่นถือว่าไม่ได้เลือก (REV-008 REV-011) */
export function parseStars(value: unknown): number | null {
  return typeof value === "string" && /^[1-5]$/.test(value.trim()) ? Number(value) : null;
}

type PickedFile = { name: string; type: string; size: number };

/** คัดรูปที่เลือกมาตามลำดับที่เลือก โดยมีรูปในฟอร์มอยู่แล้ว count รูป (REV-002) */
export function screenReviewFiles<F extends PickedFile>(count: number, files: F[]) {
  const accepted: F[] = [];
  const rejected: { name: string; error: string }[] = [];
  for (const file of files) {
    let error: string | undefined;
    if (file.size > LIMITS.imageBytes) error = MESSAGES.imageTooLarge;
    else if (count + accepted.length >= LIMITS.images) error = MESSAGES.tooManyImages;
    else if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) error = MESSAGES.imageWrongType;
    if (error) rejected.push({ name: file.name, error });
    else accepted.push(file);
  }
  return { accepted, rejected };
}
