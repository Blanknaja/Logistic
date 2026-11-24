import { beforeEach, describe, expect, test } from "vitest";
import { logIn } from "@/features/account/server/accounts";
import { isResetLinkUsable, requestPasswordReset, resetPassword } from "@/features/account/server/password-reset";
import { createSession, resumeSession } from "@/features/account/server/sessions";
import type { Db } from "@/shared/db";
import { addAccount, TEST_PASSWORD } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";

let db: Db;

beforeEach(() => {
  db = createTestDb();
});

/** เวลาประเทศไทย เช่น at("15:00") */
const at = (time: string) => new Date(`2026-11-24T${time}+07:00`);
const APP_URL = "https://blanksong.example";

/** ขอลิงก์ในเวลาที่กำหนด แล้วคืน token ที่อยู่ในลิงก์ของอีเมล */
function requestLink(email: string, time: string): string {
  const message = requestPasswordReset(db, email, APP_URL, at(time));
  const token = message?.text.match(/\/reset-password\?token=([\w-]+)/)?.[1];
  if (!token) throw new Error("ต้องได้อีเมลที่มีลิงก์");
  return token;
}

const canLogIn = async (password: string) =>
  (await logIn(db, { email: "somchai@example.com", password }, at("15:20"))).ok;

describe("ACC-009 ขอลิงก์ตั้งรหัสผ่านใหม่", () => {
  test("ACC-009 อีเมลที่มีบัญชี ได้อีเมล 1 ฉบับที่มีลิงก์ใช้ได้ถึง 15:30", () => {
    addAccount(db, { email: "somchai@example.com" });
    const message = requestPasswordReset(db, "SOMCHAI@example.com", APP_URL, at("15:00"));

    expect(message?.to).toBe("somchai@example.com");
    expect(message?.text).toContain(`${APP_URL}/reset-password?token=`);
    expect(message?.text).toContain("24/11/2026 15:30");
    const token = requestLink("somchai@example.com", "15:00");
    expect(isResetLinkUsable(db, token, at("15:29"))).toBe(true);
    expect(isResetLinkUsable(db, token, at("15:30"))).toBe(false);
  });

  test("ACC-009 อีเมลที่ไม่มีบัญชี ไม่มีอีเมลถูกส่ง และไม่มีลิงก์ถูกสร้าง", () => {
    addAccount(db, { email: "somchai@example.com" });

    expect(requestPasswordReset(db, "nobody@example.com", APP_URL, at("15:10"))).toBeNull();
    expect(requestPasswordReset(db, "", APP_URL, at("15:10"))).toBeNull();
    expect(db.prepare("SELECT count(*) AS n FROM password_reset_tokens").get()).toEqual({ n: 0 });
  });

  test("ACC-009 ขอซ้ำเวลา 15:05 ลิงก์แรกใช้ไม่ได้ทันที ลิงก์ที่ 2 ใช้ได้ถึง 15:35", () => {
    addAccount(db, { email: "somchai@example.com" });
    const first = requestLink("somchai@example.com", "15:00");
    const second = requestLink("somchai@example.com", "15:05");

    expect(isResetLinkUsable(db, first, at("15:05"))).toBe(false);
    expect(isResetLinkUsable(db, second, at("15:34"))).toBe(true);
    expect(isResetLinkUsable(db, second, at("15:35"))).toBe(false);
  });

  test("ACC-009 บัญชีที่ถูกระงับยังขอลิงก์ได้", () => {
    addAccount(db, { email: "prayut@example.com", status: "ถูกระงับ" });
    expect(requestPasswordReset(db, "prayut@example.com", APP_URL, at("15:00"))?.to).toBe("prayut@example.com");
  });
});

describe("ACC-010 ตั้งรหัสผ่านใหม่จากลิงก์", () => {
  test("ACC-010 ตั้งรหัสใหม่ 12 ตัวอักษร รหัสเก่าใช้ไม่ได้ รหัสใหม่ใช้ได้ และทุกเครื่องออกจากระบบ", async () => {
    const somchai = addAccount(db, { email: "somchai@example.com" });
    const mobile = createSession(db, somchai.id, at("14:00"));
    const token = requestLink("somchai@example.com", "15:00");

    expect(await resetPassword(db, { token, password: "newpass12345" }, at("15:10"))).toEqual({ status: "done" });
    expect(await canLogIn(TEST_PASSWORD)).toBe(false);
    expect(await canLogIn("newpass12345")).toBe(true);
    expect(resumeSession(db, mobile, at("15:11")).problem).toBe("relogin");
  });

  test("ACC-010 เปิดลิงก์เวลา 15:45 หรือใช้ลิงก์ซ้ำ ลิงก์ใช้ไม่ได้ และรหัสผ่านไม่เปลี่ยน", async () => {
    addAccount(db, { email: "somchai@example.com" });
    const late = requestLink("somchai@example.com", "15:00");

    expect(isResetLinkUsable(db, late, at("15:45"))).toBe(false);
    expect(await resetPassword(db, { token: late, password: "newpass12345" }, at("15:45"))).toEqual({
      status: "link-unusable",
    });
    expect(await canLogIn(TEST_PASSWORD)).toBe(true);

    const used = requestLink("somchai@example.com", "15:50");
    await resetPassword(db, { token: used, password: "firstnew1234" }, at("15:51"));
    expect(isResetLinkUsable(db, used, at("15:52"))).toBe(false);
    expect(await resetPassword(db, { token: used, password: "secondnew123" }, at("15:52"))).toEqual({
      status: "link-unusable",
    });
    expect((await logIn(db, { email: "somchai@example.com", password: "firstnew1234" }, at("15:53"))).ok).toBe(true);
  });

  test("ACC-010 ลิงก์ที่ไม่มีอยู่จริงใช้ไม่ได้", async () => {
    expect(isResetLinkUsable(db, "not-a-token", at("15:00"))).toBe(false);
    expect(await resetPassword(db, { token: "", password: "newpass12345" }, at("15:00"))).toEqual({
      status: "link-unusable",
    });
  });

  test("ACC-010 รหัสใหม่ 5 ตัวอักษร ได้ข้อความบอกเหตุ รหัสเดิมยังใช้ได้ และลิงก์ยังใช้ได้ถึง 15:30", async () => {
    addAccount(db, { email: "somchai@example.com" });
    const token = requestLink("somchai@example.com", "15:00");

    expect(await resetPassword(db, { token, password: "12345" }, at("15:10"))).toEqual({
      status: "invalid",
      errors: { password: "รหัสผ่านต้องยาว 8 ถึง 64 ตัวอักษร" },
    });
    expect(await canLogIn(TEST_PASSWORD)).toBe(true);
    expect(isResetLinkUsable(db, token, at("15:29"))).toBe(true);
  });

  test("ACC-010 ส่งลิงก์เดียวกันพร้อมกัน 2 ครั้ง ตั้งรหัสผ่านได้ครั้งเดียว", async () => {
    addAccount(db, { email: "somchai@example.com" });
    const token = requestLink("somchai@example.com", "15:00");

    const results = await Promise.all([
      resetPassword(db, { token, password: "laptop123456" }, at("15:10")),
      resetPassword(db, { token, password: "mobile123456" }, at("15:10")),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(["done", "link-unusable"]);
    expect(await canLogIn("laptop123456")).toBe(true);
  });
});
