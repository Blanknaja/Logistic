// กฎหน้าตารอบ 3 ใน docs/design-system.md ที่ตรวจจากไฟล์ CSS ได้

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";

const root = join(process.cwd(), "src");
const cssFiles = (readdirSync(root, { recursive: true }) as string[])
  .filter((file) => file.endsWith(".css"))
  .map((file) => join(root, file));
/** เนื้อไฟล์ CSS ที่ตัด comment ออกแล้ว */
const read = (file: string) => readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const globals = read(join(root, "app/globals.css"));

type Rule = { file: string; selector: string; body: string; name: string };

/** ทุกกฎชั้นในสุดของทุกไฟล์ name คือ "ไฟล์ selector" */
const rules: Rule[] = cssFiles.flatMap((path) => {
  const file = relative(root, path);
  return [...read(path).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, rawSelector, body]) => {
    const selector = rawSelector.trim().replace(/\s+/g, " ");
    return { file, selector, body, name: `${file} ${selector}` };
  });
});

const rulesWith = (declaration: RegExp) => rules.filter((rule) => declaration.test(rule.body)).map((rule) => rule.name);

describe("token", () => {
  test("สีพิมพ์เป็นตัวเลขได้เฉพาะใน :root ของ globals.css ที่อื่นใช้ var()", () => {
    expect(rulesWith(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i)).toEqual(["app/globals.css :root"]);
  });

  test("ไม่มีไฟล์ไหนใช้ token ของรอบ 2 ที่ถูกแทนแล้ว", () => {
    expect(rulesWith(/var\(--(radius|duration|ease)\)/)).toEqual([]);
  });

  test("gradient มีแค่พื้นของส่วนต้อนรับ ขอบจางของแถวที่เลื่อนข้าง และแสงของโครงสี", () => {
    expect(rulesWith(/gradient\(/)).toEqual([
      "app/globals.css .skeleton::after",
      "features/browse/components/home.module.css .hero",
      "features/browse/components/home.module.css .scroller::after",
    ]);
  });

  test("ตัวเลือกที่เลือกอยู่ใช้ --selected-ring", () => {
    expect(rulesWith(/var\(--selected-ring\)/).some((name) => name.endsWith('.thumb[aria-pressed="true"]::after'))).toBe(true);
  });
});

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
    const hover = rulesWith(/border-color/).filter((name) => name.includes(":hover") && name.includes(".input"));
    expect(hover.length).toBeGreaterThan(0);
    for (const name of hover) expect(name).toContain('[aria-invalid="true"]');
  });
});

describe("การขยับ", () => {
  // property ที่เบราว์เซอร์ต้องจัดหน้าใหม่ทุกเฟรม ขยับแล้วหน้ากระตุกและของข้างเคียงกระโดด
  const LAYOUT = /^(width|height|min-\w+|max-\w+|top|left|right|bottom|inset[\w-]*|margin[\w-]*|padding[\w-]*|font-size|gap)$/;

  test("transition ไม่แตะ property ที่ทำให้หน้ากระตุก และไม่ใช้ all", () => {
    const moved = rules.flatMap((rule) =>
      [...rule.body.matchAll(/transition(?:-property)?:\s*([^;]+)/g)]
        .flatMap(([, value]) => value.split(",").map((part) => part.trim().split(/\s+/)[0]))
        .filter((property) => property === "all" || LAYOUT.test(property))
        .map((property) => `${rule.name} ${property}`),
    );
    expect(moved).toEqual([]);
  });

  test("@keyframes ไม่แตะ property ที่ทำให้หน้ากระตุก", () => {
    const moved = cssFiles.flatMap((path) =>
      [...read(path).matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)/g)].flatMap(([, name, frames]) =>
        [...frames.matchAll(/([\w-]+)\s*:/g)]
          .map(([, property]) => property)
          .filter((property) => LAYOUT.test(property))
          .map((property) => `${relative(root, path)} ${name} ${property}`),
      ),
    );
    expect(moved).toEqual([]);
  });

  test("ของที่ขยับเองไม่มีจบมีแค่โครงสีระหว่างโหลด", () => {
    expect(rulesWith(/infinite/)).toEqual(["app/globals.css .skeleton::after"]);
  });

  test("เวลาของการขยับมาจาก --dur-* ยกเว้นโครงสีระหว่างโหลดและกฎลดการขยับ", () => {
    const literal = rules
      .filter((rule) => /(?:transition|animation)[\w-]*:[^;]*\b\d*\.?\d+m?s\b/.test(rule.body))
      .filter((rule) => !/!important/.test(rule.body))
      .map((rule) => rule.name);
    expect(literal).toEqual(["app/globals.css .skeleton::after"]);
  });

  test("ผู้ใช้ขอลดการขยับ: ทุก animation และ transition จบทันที ของที่ผูกกับการเลื่อนเลิกผูก และการเปลี่ยนหน้าไม่ขยับ", () => {
    const reduced = globals.slice(globals.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/\*,\s*\*::before,\s*\*::after\s*\{[^}]*transition-duration: 1ms !important/);
    expect(reduced).toMatch(/animation-duration: 1ms !important/);
    expect(reduced).toMatch(/animation-iteration-count: 1 !important/);
    expect(reduced).toMatch(/animation-timeline: auto !important/);
    expect(reduced).toMatch(/::view-transition-group\(\*\)\s*\{[^}]*animation-duration: 0s !important/);
  });

  test("ของที่ผูกกับการเลื่อนอยู่ใน @supports เบราว์เซอร์ที่ไม่รองรับจึงเห็นของนิ่งครบ", () => {
    for (const path of cssFiles) {
      const css = read(path);
      const timelines = [...css.matchAll(/(?<!\()animation-timeline:\s*(view|scroll)\(/g)].length;
      const guarded = [...css.matchAll(/@supports \(animation-timeline: (view|scroll)\(\)\)/g)].length;
      expect(guarded, relative(root, path)).toBe(timelines);
    }
  });

  test("การเปลี่ยนหน้าไม่กันการกด", () => {
    expect(globals).toMatch(/::view-transition \{\s*pointer-events: none;/);
  });
});

describe("breakpoint", () => {
  test("max-width ใช้ได้แค่ 599px กับ 899px คือกฎที่มีเฉพาะจอเล็กกว่า breakpoint", () => {
    const widths = cssFiles.flatMap((file) => [...read(file).matchAll(/@media[^{]*max-width:\s*([^)]+)\)/g)].map((match) => match[1]));
    expect(widths.length).toBeGreaterThan(0);
    expect(widths.filter((width) => width !== "599px" && width !== "899px")).toEqual([]);
  });
});

describe("หน้าที่สคริปต์ไม่ทำงาน", () => {
  test("ไม่มี CSS ที่ถาม @media (scripting) เพราะเบราว์เซอร์ที่เปิด JavaScript แต่โหลดสคริปต์ของแอปไม่ได้ก็ตอบว่ามี", () => {
    expect(cssFiles.filter((file) => /@media[^{]*scripting/.test(read(file))).map((file) => relative(root, file))).toEqual([]);
  });
});
