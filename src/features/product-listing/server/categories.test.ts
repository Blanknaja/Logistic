import { expect, test } from "vitest";
import { createTestDb } from "@/shared/db/testing";
import { listCategories } from "./categories";

test("PRD-002 หมวดหมู่ 12 หมวดเป็น object ธรรมดา ส่งให้หน้าฟอร์มที่ทำงานบนเบราว์เซอร์ได้", () => {
  const categories = listCategories(createTestDb());
  expect(categories).toHaveLength(12);
  expect(categories[0]).toEqual({ id: 1, name: "เสื้อผ้าและแฟชั่น" });
  expect(categories.every((category) => Object.getPrototypeOf(category) === Object.prototype)).toBe(true);
});
