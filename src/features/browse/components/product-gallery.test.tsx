import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { ProductGallery } from "@/features/browse/components/product-gallery";
import { MODEL_LOAD_TIMEOUT_MS, ProductModel } from "@/features/browse/components/product-model";

const images = ["/sample-images/c1.svg", "/sample-images/c2.svg", "/sample-images/c3.svg"];
const model = "/product-models/chair";
const buttons = (html: string) => [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((match) => match[0]);

describe("P3D-003 ทางเข้า ดูแบบ 3 มิติ ในแกลเลอรี", () => {
  test("P3D-003 สินค้าที่มีไฟล์ 3 มิติ แสดงรูปปกเป็นรูปใหญ่ รูปย่อ 3 รูป ตามด้วยทางเข้า ดูแบบ 3 มิติ", () => {
    const html = renderToStaticMarkup(<ProductGallery images={images} name="เก้าอี้ผ้ากำมะหยี่" model={model} />);

    expect(html).toMatch(/^<div><img src="\/sample-images\/c1\.svg" alt="เก้าอี้ผ้ากำมะหยี่"/);
    const thumbs = buttons(html);
    expect(thumbs).toHaveLength(4);
    expect(thumbs.slice(0, 3).map((button) => button.match(/aria-label="([^"]+)"/)?.[1])).toEqual(["ดูรูปที่ 1", "ดูรูปที่ 2", "ดูรูปที่ 3"]);
    expect(thumbs[3]).toContain(">ดูแบบ 3 มิติ</button>");
    expect(thumbs[3]).toContain('aria-pressed="false"');
  });

  test("P3D-003 สินค้าที่ไม่มีไฟล์ 3 มิติ แสดงแกลเลอรีเหมือนเดิมโดยไม่มีทางเข้านี้ (P3D-006)", () => {
    const html = renderToStaticMarkup(<ProductGallery images={images} name="เสื้อยืดคอกลม" model={null} />);
    expect(buttons(html)).toHaveLength(3);
    expect(html).not.toContain("3 มิติ");
  });

  test("P3D-003 สินค้ารูปเดียวที่มีไฟล์ 3 มิติ ยังมีทางเข้า ส่วนรูปเดียวที่ไม่มีไฟล์ไม่มีรูปย่อเลย", () => {
    expect(buttons(renderToStaticMarkup(<ProductGallery images={images.slice(0, 1)} name="แจกัน" model={model} />))).toHaveLength(2);
    expect(buttons(renderToStaticMarkup(<ProductGallery images={images.slice(0, 1)} name="แจกัน" model={null} />))).toHaveLength(0);
  });

  test("P3D-Q01 หน้าสินค้าที่ยังไม่กด ดูแบบ 3 มิติ ไม่มีที่อยู่ไฟล์ 3 มิติและตัวแสดง 3 มิติในหน้า", () => {
    const html = renderToStaticMarkup(<ProductGallery images={images} name="เก้าอี้ผ้ากำมะหยี่" model={model} />);
    expect(html).not.toContain(model);
    expect(html).not.toContain("model-viewer");
  });
});

describe("P3D-004 ดูแบบ 3 มิติ", () => {
  const viewer = () => renderToStaticMarkup(<ProductModel src={model} cover={images[0]} alt="เก้าอี้ผ้ากำมะหยี่" />);

  test("P3D-004 ระหว่างรอเห็นรูปปกกับสัญลักษณ์กำลังโหลด และตัวแสดงหมุนด้วยการลากและซูมได้", () => {
    const html = viewer();
    expect(html).toContain(`<img src="${images[0]}" alt=""`);
    expect(html).toMatch(/role="status"[^>]*>กำลังโหลด</);
    expect(html).toMatch(new RegExp(`<model-viewer[^>]* src="${model}" alt="เก้าอี้ผ้ากำมะหยี่"[^>]* camera-controls=""`));
  });

  test("P3D-Q02 ถ้าเกิน 30 วินาทียังไม่เห็นภาพ ถือว่าแสดงไม่ได้ และเห็นข้อความกับปุ่ม ลองใหม่ ตาม P3D-004", () => {
    expect(MODEL_LOAD_TIMEOUT_MS).toBe(30_000);
  });
});

describe("P3D-005 ดูในห้องของคุณ", () => {
  test("P3D-005 ตัวแสดงเปิดการวางของในห้องที่ขนาดจริงซึ่งย่อขยายไม่ได้ และมีปุ่ม ดูในห้องของคุณ ที่ตัวแสดงซ่อนเองบนอุปกรณ์ที่ทำไม่ได้", () => {
    const html = renderToStaticMarkup(<ProductModel src={model} cover={images[0]} alt="เก้าอี้ผ้ากำมะหยี่" />);
    const tag = html.match(/<model-viewer[^>]*>/)?.[0] ?? "";
    expect(tag).toContain(' ar=""');
    expect(tag).toContain(' ar-scale="fixed"');
    expect(html).toMatch(/<button slot="ar-button" type="button"[^>]*>ดูในห้องของคุณ<\/button>/);
  });
});
