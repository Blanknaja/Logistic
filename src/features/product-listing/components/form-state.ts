import { IMAGE_TYPES, LIMITS, MESSAGES, variantCombos, type ProductValues } from "@/features/product-listing/server/product-rules";

/** รูปที่ส่งไม่เสร็จใน 30 วินาทีถือว่าไม่สำเร็จ (PRD-003) */
export const UPLOAD_TIMEOUT_MS = 30_000;

/** รูปหนึ่งรูปในหน้าฟอร์ม url มีค่าเมื่อส่งขึ้นเซิร์ฟเวอร์เสร็จแล้ว */
export type ImageItem = {
  id: string;
  preview: string;
  url: string | null;
  file: File | null;
  status: "uploading" | "done" | "failed";
  progress: number;
  error?: string;
};

/** ไฟล์ 3 มิติที่ส่งไม่เสร็จใน 60 วินาทีถือว่าไม่สำเร็จ (P3D-001) */
export const MODEL_UPLOAD_TIMEOUT_MS = 60_000;

/** ไฟล์ 3 มิติในหน้าฟอร์ม url มีค่าเมื่อส่งขึ้นเซิร์ฟเวอร์เสร็จแล้ว */
export type ModelItem = Omit<ImageItem, "id" | "preview"> & { name: string; size: number };

export const canSaveModel = (model: ModelItem | null) => model === null || model.status === "done";

export const formatFileSize = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

type PickedFile = { name: string; type: string; size: number };

/** คัดรูปที่เลือกมา ตามลำดับที่เลือก โดยมีรูปในฟอร์มอยู่แล้ว count รูป */
export function screenFiles<F extends PickedFile>(count: number, files: F[]) {
  const accepted: F[] = [];
  const rejected: { name: string; error: string }[] = [];
  for (const file of files) {
    let error: string | undefined;
    if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) error = MESSAGES.imageWrongType;
    else if (file.size > LIMITS.imageBytes) error = MESSAGES.imageTooLarge;
    else if (count + accepted.length >= LIMITS.images) error = MESSAGES.tooManyImages;
    if (error) rejected.push({ name: file.name, error });
    else accepted.push(file);
  }
  return { accepted, rejected };
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export const canSaveImages = (items: ImageItem[]) => items.every((item) => item.status === "done");

/** ให้ราคามีครบทุกแบบย่อยของตัวเลือกปัจจุบันพอดี ราคาของแบบย่อยที่หายไปแล้วถูกตัดทิ้ง */
export function normalizeValues(values: ProductValues): ProductValues {
  const prices = Object.fromEntries(variantCombos(values.options).map((combo) => [combo.key, values.prices[combo.key] ?? ""]));
  return { ...values, prices };
}

/** มีการแก้ที่ยังไม่ได้บันทึกหรือไม่ (PRD-014) ทั้งสองค่าต้องผ่าน normalizeValues() มาก่อน */
export function isDirty(saved: ProductValues, current: ProductValues, images: ImageItem[]): boolean {
  return !canSaveImages(images) || JSON.stringify(saved) !== JSON.stringify(current);
}

