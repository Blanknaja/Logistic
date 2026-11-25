// ฟอร์มของบัญชีผ่านหน้าเว็บจริง (docs/requirements/account.md) ตำแหน่งของข้อความผิดพลาดตรวจได้เฉพาะในเบราว์เซอร์

import { expect, test } from "@playwright/test";

test("ACC-003 อีเมลหรือรหัสผ่านผิด ข้อความอยู่ใต้ช่องรหัสผ่านก่อนปุ่ม และช่องรหัสผ่านถูกล้าง", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("อีเมล").fill("nobody@example.com");
  await page.getByLabel("รหัสผ่าน").fill("wrong-password");
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();

  const message = page.getByRole("alert").filter({ hasText: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" });
  await expect(message).toBeVisible();
  const password = (await page.getByLabel("รหัสผ่าน").boundingBox())!;
  const text = (await message.boundingBox())!;
  const button = (await page.getByRole("button", { name: "เข้าสู่ระบบ" }).boundingBox())!;
  expect(text.y).toBeGreaterThanOrEqual(password.y + password.height);
  expect(text.y + text.height).toBeLessThanOrEqual(button.y);
  await expect(page.getByLabel("รหัสผ่าน")).toHaveValue("");
});
