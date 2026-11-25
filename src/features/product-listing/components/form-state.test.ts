import { afterEach, describe, expect, test, vi } from "vitest";
import { EMPTY_PRODUCT, type ProductValues } from "@/features/product-listing/server/product-rules";
import { CHAIR_GLB_BYTES } from "@/features/product-listing/server/testing";
import {
  canSaveImages,
  canSaveModel,
  formatFileSize,
  isDirty,
  MODEL_UPLOAD_TIMEOUT_MS,
  moveItem,
  normalizeValues,
  screenFiles,
  UPLOAD_TIMEOUT_MS,
  type ImageItem,
  type ModelItem,
} from "./form-state";
import { ACTION_TIMEOUT_MS, settle } from "@/shared/ui/timeout";

const MB = 1024 * 1024;
const jpg = (name: string, size: number) => ({ name, type: "image/jpeg", size });
const done = (id: string): ImageItem => ({ id, preview: `/${id}`, url: `/${id}`, file: null, status: "done", progress: 100 });

afterEach(() => {
  vi.useRealTimers();
});

describe("PRD-003 เพิ่มรูปในหน้าฟอร์ม", () => {
  test("PRD-003 รูป JPG 3 รูป รูปละ 2 MB ถูกรับครบ", () => {
    const files = [jpg("1.jpg", 2 * MB), jpg("2.jpg", 2 * MB), jpg("3.jpg", 2 * MB)];
    expect(screenFiles(0, files)).toEqual({ accepted: files, rejected: [] });
  });

  test("PRD-003 ลากรูปที่สามขึ้นมาเป็นลำดับแรก รูปนั้นกลายเป็นรูปปก", () => {
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveItem(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
  });

  test("PRD-003 มีรูป 8 รูป เลือกเพิ่ม 3 รูป รับรูปแรก รูป 7 MB และรูปที่เกิน 9 รูปไม่ถูกรับพร้อมเหตุผล", () => {
    const png = { name: "a.png", type: "image/png", size: MB };
    const result = screenFiles(8, [png, jpg("b.jpg", 7 * MB), jpg("c.jpg", 2 * MB)]);

    expect(result.accepted).toEqual([png]);
    expect(result.rejected).toEqual([
      { name: "b.jpg", error: "รูปต้องมีขนาดไม่เกิน 5 MB" },
      { name: "c.jpg", error: "ใส่รูปได้ไม่เกิน 9 รูป" },
    ]);
  });

  test("PRD-003 ไฟล์ที่ไม่ใช่ JPG หรือ PNG ไม่ถูกรับ", () => {
    expect(screenFiles(0, [{ name: "a.gif", type: "image/gif", size: MB }]).rejected).toEqual([
      { name: "a.gif", error: "รูปต้องเป็นไฟล์ JPG หรือ PNG" },
    ]);
  });

  test("PRD-003 รูปที่ส่งไม่เสร็จใน 30 วินาทีถือว่าส่งไม่สำเร็จ และปุ่มบันทึกกดไม่ได้จนกว่าจะส่งสำเร็จหรือถูกลบ", () => {
    expect(UPLOAD_TIMEOUT_MS).toBe(30_000);
    const failed: ImageItem = { ...done("x"), url: null, status: "failed" };
    const uploading: ImageItem = { ...done("y"), url: null, status: "uploading", progress: 40 };

    expect(canSaveImages([done("a"), failed])).toBe(false);
    expect(canSaveImages([done("a"), uploading])).toBe(false);
    expect(canSaveImages([done("a")])).toBe(true);
  });
});

describe("P3D-001 ไฟล์ 3 มิติในหน้าฟอร์ม", () => {
  const chair = (patch: Partial<ModelItem> = {}): ModelItem => ({
    url: "/product-models/a",
    name: "chair.glb",
    size: CHAIR_GLB_BYTES,
    file: null,
    status: "done",
    progress: 100,
    ...patch,
  });

  test("P3D-001 ไฟล์ที่ส่งเสร็จแสดงชื่อและขนาด chair.glb 3.9 MB", () => {
    expect(`${chair().name} ${formatFileSize(chair().size)}`).toBe("chair.glb 3.9 MB");
    expect(formatFileSize(10 * MB)).toBe("10.0 MB");
  });

  test("P3D-001 ไฟล์ที่ส่งไม่เสร็จใน 60 วินาทีถือว่าส่งไม่สำเร็จ และปุ่มบันทึกกดไม่ได้จนกว่าจะส่งสำเร็จหรือถูกเอาออก", () => {
    expect(MODEL_UPLOAD_TIMEOUT_MS).toBe(60_000);
    expect(canSaveModel(chair({ url: null, status: "failed" }))).toBe(false);
    expect(canSaveModel(chair({ url: null, status: "uploading", progress: 40 }))).toBe(false);
    expect(canSaveModel(chair())).toBe(true);
    expect(canSaveModel(null)).toBe(true);
  });
});

describe("PRD-014 รู้ว่ามีการแก้ที่ยังไม่บันทึก", () => {
  const saved: ProductValues = {
    ...EMPTY_PRODUCT,
    name: "เสื้อยืดคอกลม",
    images: ["/a"],
    options: [{ name: "สี", values: ["แดง"] }],
    prices: { '["แดง"]': "270" },
  };

  test("PRD-014 เปิดฟอร์มแล้วยังไม่ได้แก้อะไร ออกได้ทันทีโดยไม่ถาม", () => {
    expect(isDirty(normalizeValues(saved), normalizeValues(saved), [done("a")])).toBe(false);
    expect(isDirty(normalizeValues(EMPTY_PRODUCT), normalizeValues(EMPTY_PRODUCT), [])).toBe(false);
  });

  test("PRD-014 แก้ราคาแล้วยังไม่บันทึก ต้องถามก่อนออก", () => {
    const edited = { ...saved, prices: { '["แดง"]': "300" } };
    expect(isDirty(normalizeValues(saved), normalizeValues(edited), [done("a")])).toBe(true);
  });

  test("PRD-014 สินค้าใหม่ที่ใส่รูปไว้ หรือรูปยังส่งอยู่ ต้องถามก่อนออก", () => {
    const uploading: ImageItem = { ...done("y"), url: null, status: "uploading", progress: 10 };
    expect(isDirty(normalizeValues(EMPTY_PRODUCT), normalizeValues(EMPTY_PRODUCT), [uploading])).toBe(true);
    expect(isDirty(normalizeValues(EMPTY_PRODUCT), normalizeValues({ ...EMPTY_PRODUCT, images: ["/a"] }), [done("a")])).toBe(true);
  });

  test("PRD-014 ราคาของแบบย่อยที่ถูกเอาออกไปแล้วไม่นับ", () => {
    expect(normalizeValues({ ...saved, prices: { '["แดง"]': "270", '["ดำ"]': "1" } }).prices).toEqual({ '["แดง"]': "270" });
  });
});

describe("PRD-Q02 บันทึกที่ไม่ได้ผลใน 10 วินาที", () => {
  test("PRD-Q02 ได้ผลทันเวลา ส่งผลต่อตามเดิม", async () => {
    expect(await settle(Promise.resolve({ errors: {} }))).toEqual({ errors: {} });
  });

  test("PRD-Q02 ไม่ได้ผลใน 10 วินาที ได้ผลว่าไม่สำเร็จ", async () => {
    vi.useFakeTimers();
    const pending = settle(new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(ACTION_TIMEOUT_MS);
    expect(await pending).toEqual({ failed: true });
  });

  test("PRD-Q02 เน็ตหลุดระหว่างบันทึก ได้ผลว่าไม่สำเร็จแทนหน้าผิดพลาด", async () => {
    expect(await settle(Promise.reject(new TypeError("Failed to fetch")))).toEqual({ failed: true });
  });
});
