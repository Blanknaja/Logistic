// กฎหน้าตาใน docs/design-system.md ที่ตรวจจากไฟล์ CSS ได้

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";

const root = join(process.cwd(), "src");
const cssFiles = (readdirSync(root, { recursive: true }) as string[])
  .filter((file) => file.endsWith(".css"))
  .map((file) => join(root, file));

/** ทุกกฎใน CSS ที่มีค่านี้ ได้เป็น "ไฟล์ selector" */
function rulesWith(declaration: RegExp): string[] {
  return cssFiles.flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, , body]) => declaration.test(body))
      .map(([, selector]) => `${relative(root, file)} ${selector.trim().replace(/\s+/g, " ")}`),
  );
}

describe("รูปสินค้า", () => {
  test("รูปในรายการและแถวเต็มกรอบสี่เหลี่ยมด้วย cover มีแค่รูปใหญ่ในหน้าสินค้าที่แสดงทั้งรูปด้วย contain", () => {
    expect(rulesWith(/object-fit:\s*contain/)).toEqual([
      "features/browse/components/browse.module.css .plate > .image",
      "features/browse/components/product-model.module.css .cover > img",
    ]);
  });
});

describe("ช่องกรอก", () => {
  test("ขอบสีแดงของช่องที่ผิดไม่ถูกสีขอบตอนชี้ทับ", () => {
    const hover = rulesWith(/border-color/).filter((rule) => rule.includes(":hover") && rule.includes(".input"));
    expect(hover.length).toBeGreaterThan(0);
    for (const rule of hover) expect(rule).toContain('[aria-invalid="true"]');
  });
});
