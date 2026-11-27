import { expect, test } from "vitest";
import { clampPage, pageCount } from "./paging";

test("pageCount นับหน้าตามขนาดหน้าที่ให้ ไม่มีรายการก็นับเป็น 1 หน้า", () => {
  expect(pageCount(0)).toBe(1);
  expect(pageCount(20)).toBe(1);
  expect(pageCount(21)).toBe(2);
  expect(pageCount(21, 10)).toBe(3);
  expect(pageCount(0, 10)).toBe(1);
});

test("clampPage ค่าที่ไม่ใช่เลขหน้าได้หน้า 1 และหน้าที่เกินได้หน้าสุดท้าย", () => {
  expect(clampPage(2, 3)).toBe(2);
  expect(clampPage(9, 3)).toBe(3);
  expect(clampPage(0, 3)).toBe(1);
  expect(clampPage(-4, 3)).toBe(1);
  expect(clampPage(1.5, 3)).toBe(1);
  expect(clampPage(Number.NaN, 3)).toBe(1);
  expect(clampPage(Number.POSITIVE_INFINITY, 3)).toBe(1);
});
