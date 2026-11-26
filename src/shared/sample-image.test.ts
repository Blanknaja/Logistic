import { describe, expect, test } from "vitest";
import { sampleImageSvg } from "@/shared/sample-image";

describe("รูปตัวอย่าง", () => {
  test("ชื่อเดิมได้รูปเดิม ชื่อต่างกันได้สีต่างกัน", () => {
    expect(sampleImageSvg("s1-1.svg")).toBe(sampleImageSvg("s1-1.svg"));
    expect(sampleImageSvg("s1-1.svg")).not.toBe(sampleImageSvg("s2-1.svg"));
    expect(sampleImageSvg("shop3.svg")).toMatch(/^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  });

  test("ชื่อไฟล์ที่ไม่ใช่รูปแบบของข้อมูลตัวอย่าง ได้ null", () => {
    expect(sampleImageSvg("../secret.svg")).toBeNull();
    expect(sampleImageSvg("<script>.svg")).toBeNull();
    expect(sampleImageSvg("s1-1.png")).toBeNull();
  });
});

describe("รูปแทนของสินค้าตัวอย่าง", () => {
  test("ชื่อไฟล์ที่ลงท้ายด้วยเลขหมวดได้ไอคอนของหมวดนั้น ชื่อแบบเก่าได้รูปกล่องพัสดุ", () => {
    const icon = (file: string) => sampleImageSvg(file)!.match(/<path d="([^"]+)"/)![1];
    expect(icon("s7-1-c1.svg")).not.toBe(icon("s7-1-c2.svg"));
    expect(icon("s7-1.svg")).toBe(icon("s7-1-c12.svg"));
  });
});
