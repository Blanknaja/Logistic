// test ระดับหน้าและ server action ของ account
// จำลอง cookie ของเครื่องด้วย jar และให้ getDb() คืนฐานข้อมูลของ test
// feature อื่นที่อยากลองหน้าที่ต้องเข้าสู่ระบบ ลอกส่วน vi.mock ข้างล่างไปใช้ได้

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import ForgotPasswordPage from "@/app/forgot-password/page";
import LoginPage from "@/app/login/page";
import ProfileError from "@/app/profile/error";
import ProfilePage from "@/app/profile/page";
import ResetPasswordError from "@/app/reset-password/error";
import ResetPasswordPage from "@/app/reset-password/page";
import SignupPage from "@/app/signup/page";
import {
  logInAction,
  logOutAction,
  requestPasswordResetAction,
  resetPasswordAction,
  saveProfileAction,
  signUpAction,
} from "@/features/account/actions";
import { logIn, signUp } from "@/features/account/server/accounts";
import { requestPasswordReset } from "@/features/account/server/password-reset";
import { createSession, resumeSession } from "@/features/account/server/sessions";
import type { Db } from "@/shared/db";
import { addAccount, TEST_PASSWORD } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";
import { SiteHeader } from "@/shared/layout/site-header";
import { getCurrentAccount, SESSION_COOKIE } from "@/shared/session";

const request = vi.hoisted(() => ({
  db: undefined as Db | undefined,
  cookies: new Map<string, string>(),
  /** งานที่ after() รอทำหลังตอบหน้าเว็บ */
  after: [] as (() => Promise<void>)[],
  Redirected: class Redirected extends Error {
    constructor(readonly url: string) {
      super(`redirect ${url}`);
    }
  },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (request.cookies.has(name) ? { name, value: request.cookies.get(name) } : undefined),
    set: (name: string, value: string) => void request.cookies.set(name, value),
    delete: (name: string) => void request.cookies.delete(name),
  }),
  headers: async () => new Headers(),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: (url: string) => {
    throw new request.Redirected(url);
  },
  notFound: () => {
    throw new request.Redirected("not-found");
  },
  useRouter: () => ({ refresh: () => {} }),
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => void request.after.push(task) }));

vi.mock("@/shared/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/db")>()),
  getDb: () => request.db,
}));

let db: Db;

beforeEach(() => {
  db = createTestDb();
  request.db = db;
  request.cookies.clear();
  request.after.length = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** ผลของการเรียกหน้า: ที่อยู่ที่ถูกพาไป หรือ HTML ที่ได้ */
async function open(page: Promise<React.ReactNode>): Promise<{ redirect?: string; html?: string }> {
  try {
    return { html: renderToStaticMarkup(await page) };
  } catch (error) {
    if (error instanceof request.Redirected) return { redirect: error.url };
    throw error;
  }
}

async function submit<T>(action: Promise<T>): Promise<{ redirect?: string; state?: T }> {
  try {
    return { state: await action };
  } catch (error) {
    if (error instanceof request.Redirected) return { redirect: error.url };
    throw error;
  }
}

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
};

const props = (searchParams: Record<string, string> = {}) => ({
  params: Promise.resolve({}),
  searchParams: Promise.resolve(searchParams),
});

/** ให้เครื่องนี้เข้าสู่ระบบเป็นบัญชีนี้ */
function signInAs(accountId: number, now?: Date): string {
  const token = createSession(db, accountId, now);
  request.cookies.set(SESSION_COOKIE, token);
  return token;
}

const header = async () => renderToStaticMarkup(await SiteHeader());

/** ขอลิงก์ตั้งรหัสผ่านใหม่ให้อีเมลนี้ แล้วคืน token ในลิงก์ */
function resetLink(email: string, now?: Date): string {
  const token = requestPasswordReset(db, email, "http://localhost", now)?.text.match(/token=([\w-]+)/)?.[1];
  if (!token) throw new Error(`${email} ต้องได้ลิงก์`);
  return token;
}

describe("ACC-001 สมัครบัญชีผ่านหน้าเว็บ", () => {
  test("ACC-001 สมัครแล้วถูกพาไปหน้าแรก มีชื่อที่มุมบน โดยไม่ต้องเข้าสู่ระบบซ้ำ", async () => {
    const result = await submit(
      signUpAction(form({ email: "somchai@example.com", password: "somchai123", displayName: "สมชาย" })),
    );

    expect(result.redirect).toBe("/");
    expect((await getCurrentAccount())?.displayName).toBe("สมชาย");
    expect(await header()).toContain("สมชาย");
  });

  test("ACC-001 เปิดหน้าสมัครใหม่ แบบฟอร์มว่างทั้ง 3 ช่อง", async () => {
    const { html } = await open(SignupPage());

    expect(html?.match(/<input /g)).toHaveLength(3);
    expect(html).not.toMatch(/value="[^"]/);
  });
});

describe("ACC-002 ข้อมูลสมัครผิดผ่านหน้าเว็บ", () => {
  test("ACC-002 อีเมลซ้ำ ได้ข้อความใต้ช่องอีเมล และยังไม่เข้าสู่ระบบ", async () => {
    addAccount(db, { email: "somchai@example.com" });
    const result = await submit(
      signUpAction(form({ email: "Somchai@Example.com", password: "123456789", displayName: "สมหญิง" })),
    );

    expect(result.state).toEqual({ errors: { email: "อีเมลนี้มีบัญชีแล้ว เข้าสู่ระบบหรือกดลืมรหัสผ่าน" } });
    expect(request.cookies.size).toBe(0);
  });

  test("ACC-002 ช่องที่ไม่ได้ส่งมาเลย ได้ข้อความครบทุกช่อง", async () => {
    const result = await submit(signUpAction(new FormData()));
    expect(Object.keys(result.state?.errors ?? {}).sort()).toEqual(["displayName", "email", "password"]);
  });
});

describe("ACC-003 เข้าสู่ระบบผ่านหน้าเว็บ", () => {
  test("ACC-003 เข้าสู่ระบบสำเร็จ ถูกพาไปหน้าแรกพร้อมชื่อที่มุมบน", async () => {
    addAccount(db, { email: "somchai@example.com", displayName: "สมชาย" });
    const result = await submit(logInAction(form({ email: "SOMCHAI@example.com", password: TEST_PASSWORD, next: "" })));

    expect(result.redirect).toBe("/");
    expect(await header()).toContain("สมชาย");
  });

  test("ACC-003 เข้าสู่ระบบอยู่แล้ว เปิดหน้าเข้าสู่ระบบหรือหน้าสมัคร ถูกพาไปหน้าแรก", async () => {
    signInAs(addAccount(db).id);

    expect(await open(LoginPage(props()))).toEqual({ redirect: "/" });
    expect(await open(SignupPage())).toEqual({ redirect: "/" });
    expect(await submit(signUpAction(form({ email: "new@example.com", password: "password123", displayName: "ใหม่" })))).toEqual({
      redirect: "/",
    });
    expect((db.prepare("SELECT count(*) AS n FROM accounts").get() as { n: number }).n).toBe(1);
  });
});

describe("ACC-005 บัญชีที่ถูกระงับเปิดหน้าเว็บ", () => {
  test("ACC-005 เข้าสู่ระบบด้วยบัญชีที่ถูกระงับ ได้ข้อความถูกระงับ และไม่ได้ cookie", async () => {
    addAccount(db, { email: "prayut@example.com", status: "ถูกระงับ" });
    const result = await submit(logInAction(form({ email: "prayut@example.com", password: TEST_PASSWORD })));

    expect(result.state).toEqual({ error: "บัญชีนี้ถูกระงับ กรุณาติดต่อผู้ดูแลแพลตฟอร์ม" });
    expect(request.cookies.size).toBe(0);
  });

  test("ACC-005 เครื่องที่ค้างอยู่เปิดหน้าโปรไฟล์ ถูกพาไปหน้าเข้าสู่ระบบพร้อมข้อความถูกระงับ", async () => {
    const prayut = addAccount(db, { email: "prayut@example.com", displayName: "ประยุทธ์" });
    signInAs(prayut.id);
    db.prepare("UPDATE accounts SET status = 'ถูกระงับ' WHERE id = ?").run(prayut.id);

    expect(await open(ProfilePage(props()))).toEqual({ redirect: "/login?next=%2Fprofile" });
    const { html } = await open(LoginPage(props({ next: "/profile" })));
    expect(html).toContain("บัญชีนี้ถูกระงับ กรุณาติดต่อผู้ดูแลแพลตฟอร์ม");
    expect(html).not.toContain("prayut@example.com");
    expect(await header()).not.toContain("ประยุทธ์");
    // ฟอร์มที่ส่งค้างจากแท็บเก่าพามาพร้อม notice=relogin ก็ยังต้องบอกว่าถูกระงับ
    expect((await open(LoginPage(props({ notice: "relogin" })))).html).toContain("บัญชีนี้ถูกระงับ");
  });
});

describe("ACC-006 อยู่ในระบบต่อเนื่องผ่านหน้าเว็บ", () => {
  test("ACC-006 cookie เดิมเปิดหน้าโปรไฟล์ได้เลย ไม่ต้องเข้าสู่ระบบใหม่", async () => {
    signInAs(addAccount(db, { displayName: "สมหญิง" }).id, new Date(Date.now() - 24 * 60 * 60 * 1000));
    expect((await open(ProfilePage(props()))).html).toContain("สมหญิง");
  });

  test("ACC-006 ไม่ได้ใช้ 31 วัน ถูกพาไปหน้าเข้าสู่ระบบพร้อมข้อความ แล้วกลับมาหน้าโปรไฟล์", async () => {
    const somying = addAccount(db, { email: "somying@example.com" });
    signInAs(somying.id, new Date(Date.now() - 31 * 24 * 60 * 60 * 1000));

    expect(await open(ProfilePage(props()))).toEqual({ redirect: "/login?next=%2Fprofile" });
    const { html } = await open(LoginPage(props({ next: "/profile" })));
    expect(html).toContain("กรุณาเข้าสู่ระบบอีกครั้ง");
    expect(html).toContain('name="next" value="/profile"');

    const result = await submit(logInAction(form({ email: "somying@example.com", password: TEST_PASSWORD, next: "/profile" })));
    expect(result.redirect).toBe("/profile");
  });
});

describe("ACC-007 ออกจากระบบผ่านหน้าเว็บ", () => {
  test("ACC-007 กดออกจากระบบ ไปหน้าแรกที่มีปุ่มเข้าสู่ระบบแทนชื่อ ส่วนเครื่องอื่นยังอยู่ในระบบ", async () => {
    const somchai = addAccount(db, { displayName: "สมชาย" });
    const mobile = createSession(db, somchai.id);
    signInAs(somchai.id);

    expect(await submit(logOutAction())).toEqual({ redirect: "/" });
    expect(request.cookies.has(SESSION_COOKIE)).toBe(false);
    const html = await header();
    expect(html).toContain("เข้าสู่ระบบ");
    expect(html).not.toContain("สมชาย");
    expect(resumeSession(db, mobile).account?.id).toBe(somchai.id);
  });

  test("ACC-007 กดบันทึกในแท็บที่ออกจากระบบไปแล้ว ถูกพาไปเข้าสู่ระบบ และโปรไฟล์ไม่ถูกแก้", async () => {
    const somchai = addAccount(db, { displayName: "สมชาย" });
    signInAs(somchai.id);
    await submit(logOutAction());

    const result = await submit(saveProfileAction(form({ displayName: "แก้ทีหลัง", phone: "" })));

    expect(result.redirect).toBe("/login?next=%2Fprofile&notice=relogin");
    expect((await open(LoginPage(props({ next: "/profile", notice: "relogin" })))).html).toContain("กรุณาเข้าสู่ระบบอีกครั้ง");
    expect(db.prepare("SELECT display_name FROM accounts WHERE id = ?").get(somchai.id)).toEqual({ display_name: "สมชาย" });
  });
});

describe("ACC-008 หน้าที่ต้องเข้าสู่ระบบ", () => {
  test("ACC-008 ยังไม่เข้าสู่ระบบ เปิดโปรไฟล์ ไปหน้าเข้าสู่ระบบก่อน แล้วกลับมาหน้าโปรไฟล์", async () => {
    addAccount(db, { email: "manee@example.com" });

    expect(await open(ProfilePage(props()))).toEqual({ redirect: "/login?next=%2Fprofile" });
    const { html } = await open(LoginPage(props({ next: "/profile" })));
    expect(html).not.toContain("กรุณาเข้าสู่ระบบอีกครั้ง");
    const result = await submit(logInAction(form({ email: "manee@example.com", password: TEST_PASSWORD, next: "/profile" })));
    expect(result.redirect).toBe("/profile");
  });

  test("ACC-008 กรอกรหัสผิด 2 ครั้งแล้วถูกครั้งที่ 3 ยังกลับไปหน้าโปรไฟล์", async () => {
    addAccount(db, { email: "manee@example.com" });
    const attempt = (password: string) =>
      submit(logInAction(form({ email: "manee@example.com", password, next: "/profile" })));

    expect((await attempt("wrong-pass")).state).toEqual({ error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" });
    expect((await attempt("wrong-pass")).state).toEqual({ error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" });
    expect((await attempt(TEST_PASSWORD)).redirect).toBe("/profile");
  });

  test("ACC-008 next ที่พาออกนอกเว็บ ได้หน้าแรกแทน", async () => {
    addAccount(db, { email: "manee@example.com" });
    const result = await submit(
      logInAction(form({ email: "manee@example.com", password: TEST_PASSWORD, next: "https://evil.example" })),
    );
    expect(result.redirect).toBe("/");
  });
});

describe("ACC-011 ดูโปรไฟล์", () => {
  test("ACC-011 เห็นอีเมล ชื่อที่แสดง เบอร์โทร และปุ่มแก้ไขกับออกจากระบบ", async () => {
    signInAs(addAccount(db, { email: "somying@example.com", displayName: "สมหญิง", phone: "0812345678" }).id);
    const { html } = await open(ProfilePage(props()));

    for (const text of ["somying@example.com", "สมหญิง", "0812345678", "แก้ไข", "ออกจากระบบ"]) expect(html).toContain(text);
  });

  test("ACC-011 ยังไม่มีเบอร์โทร เห็นคำอธิบายและปุ่มเพิ่มเบอร์โทร และดูโปรไฟล์บัญชีอื่นไม่ได้", async () => {
    const other = addAccount(db, { email: "other@example.com" });
    signInAs(addAccount(db, { email: "somchai@example.com" }).id);
    const { html } = await open(ProfilePage(props({ id: String(other.id), accountId: String(other.id) })));

    expect(html).toContain("ยังไม่ได้ใส่เบอร์โทร");
    expect(html).toContain("เพิ่มเบอร์โทร");
    expect(html).toContain("somchai@example.com");
    expect(html).not.toContain("other@example.com");
  });
});

describe("ACC-012 แก้โปรไฟล์ผ่านหน้าเว็บ", () => {
  test("ACC-012 บันทึกแล้วเห็นข้อความบันทึกแล้ว ค่าใหม่ทั้ง 2 ช่อง และชื่อใหม่ที่มุมบน", async () => {
    signInAs(addAccount(db, { displayName: "สมชาย" }).id);

    expect(await submit(saveProfileAction(form({ displayName: "สมชาย ใจดี", phone: "0898765432" })))).toEqual({
      redirect: "/profile?saved=1",
    });
    const { html } = await open(ProfilePage(props({ saved: "1" })));
    for (const text of ["บันทึกแล้ว", "สมชาย ใจดี", "0898765432"]) expect(html).toContain(text);
    expect(await header()).toContain("สมชาย ใจดี");
  });

  test("ACC-012 ค่าผิดได้ข้อความ 2 จุด ค่าเดิมไม่เปลี่ยน", async () => {
    const somchai = addAccount(db, { displayName: "สมชาย ใจดี" });
    signInAs(somchai.id);

    expect((await submit(saveProfileAction(form({ displayName: "", phone: "12345" })))).state).toEqual({
      errors: { displayName: "กรุณาใส่ชื่อที่แสดง", phone: "เบอร์โทรต้องเป็นตัวเลข 10 หลัก ขึ้นต้นด้วย 0" },
    });
    expect((await open(ProfilePage(props()))).html).toContain("สมชาย ใจดี");
  });

  test("ACC-012 แบบฟอร์มแก้ไขเริ่มจากค่าที่บันทึกไว้ และปุ่มยกเลิกกลับหน้าโปรไฟล์โดยไม่บันทึก", async () => {
    signInAs(addAccount(db, { displayName: "สมชาย ใจดี", phone: "0898765432" }).id);
    const { html } = await open(ProfilePage(props({ edit: "1" })));

    expect(html).toContain('value="สมชาย ใจดี"');
    expect(html).toContain('value="0898765432"');
    expect(html).toMatch(/<a [^>]*href="\/profile"[^>]*>ยกเลิก<\/a>/);
  });
});

describe("ACC-009 ขอลิงก์ตั้งรหัสผ่านใหม่ผ่านหน้าเว็บ", () => {
  test("ACC-009 อีเมลที่มีบัญชี เห็นข้อความ และเมื่อยังไม่ตั้งค่าระบบส่งอีเมล ลิงก์ถูกเขียนลงบันทึกของเซิร์ฟเวอร์", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("APP_URL", "https://blanksong.example");
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    addAccount(db, { email: "somchai@example.com" });

    const { html } = await open(Promise.resolve(ForgotPasswordPage()));
    expect(html?.match(/<input [^>]*name="email"/g)).toHaveLength(1);
    expect(html).toContain("ส่งลิงก์");

    const result = await submit(requestPasswordResetAction(form({ email: "somchai@example.com" })));
    expect(result.state).toEqual({ notice: "ถ้าอีเมลนี้มีบัญชี เราส่งลิงก์ตั้งรหัสผ่านใหม่ให้แล้ว" });
    expect(request.after).toHaveLength(1);
    await request.after[0]();
    expect(log.mock.calls[0][0]).toContain("somchai@example.com");
    expect(log.mock.calls[0][0]).toContain("https://blanksong.example/reset-password?token=");
  });

  test("ACC-009 อีเมลที่ไม่มีบัญชี เห็นข้อความเดียวกันทุกตัวอักษร และไม่มีอีเมลถูกส่ง", async () => {
    addAccount(db, { email: "somchai@example.com" });
    const known = await submit(requestPasswordResetAction(form({ email: "somchai@example.com" })));
    request.after.length = 0;

    for (const email of ["nobody@example.com", "", "ไม่ใช่อีเมล"]) {
      expect(await submit(requestPasswordResetAction(form({ email })))).toEqual(known);
    }
    expect(request.after).toHaveLength(0);
  });
});

describe("ACC-010 ตั้งรหัสผ่านใหม่ผ่านหน้าเว็บ", () => {
  const canLogIn = async (email: string, password: string) => (await logIn(db, { email, password })).ok;

  test("ACC-010 บันทึกรหัสใหม่ ไปหน้าเข้าสู่ระบบพร้อมข้อความ รหัสใหม่ใช้ได้ และทุกเครื่องออกจากระบบ", async () => {
    const somchai = addAccount(db, { email: "somchai@example.com" });
    const mobile = createSession(db, somchai.id);
    signInAs(somchai.id);
    const token = resetLink("somchai@example.com");

    const { html } = await open(ResetPasswordPage(props({ token })));
    expect(html).toContain('type="password"');
    expect(html).toContain("บันทึก");

    const result = await submit(resetPasswordAction(form({ token, password: "newpass12345" })));
    expect(result.redirect).toBe("/login?next=%2F&notice=password-reset");
    expect(request.cookies.has(SESSION_COOKIE)).toBe(false);
    expect((await open(LoginPage(props({ next: "/", notice: "password-reset" })))).html).toContain(
      "ตั้งรหัสผ่านใหม่แล้ว กรุณาเข้าสู่ระบบ",
    );
    expect(resumeSession(db, mobile).account).toBeNull();
    expect(await canLogIn("somchai@example.com", TEST_PASSWORD)).toBe(false);
    expect(await canLogIn("somchai@example.com", "newpass12345")).toBe(true);
  });

  test("ACC-010 ลิงก์หมดเวลา ใช้ไปแล้ว หรือไม่มี token เห็นข้อความพร้อมปุ่มขอลิงก์ใหม่ ไม่เห็นช่องกรอกรหัสผ่าน", async () => {
    addAccount(db, { email: "late@example.com" });
    addAccount(db, { email: "used@example.com" });
    const late = resetLink("late@example.com", new Date(Date.now() - 31 * 60 * 1000));
    const used = resetLink("used@example.com");
    await submit(resetPasswordAction(form({ token: used, password: "firstnew1234" })));

    for (const searchParams of [{ token: late }, { token: used }, {}] as Record<string, string>[]) {
      const { html } = await open(ResetPasswordPage(props(searchParams)));
      expect(html).toContain("ลิงก์นี้ใช้ไม่ได้แล้ว");
      expect(html).toMatch(/<a [^>]*href="\/forgot-password"[^>]*>ขอลิงก์ใหม่<\/a>/);
      expect(html).not.toContain("<input");
    }
    expect(await submit(resetPasswordAction(form({ token: late, password: "newpass12345" })))).toEqual({
      redirect: `/reset-password?token=${late}`,
    });
    expect(await canLogIn("late@example.com", TEST_PASSWORD)).toBe(true);
  });

  test("ACC-010 รหัสใหม่ 5 ตัวอักษร เห็นข้อความใต้ช่อง รหัสเดิมยังใช้ได้ และลิงก์เดิมยังเปิดได้", async () => {
    addAccount(db, { email: "somchai@example.com" });
    const token = resetLink("somchai@example.com");

    expect((await submit(resetPasswordAction(form({ token, password: "12345" })))).state).toEqual({
      errors: { password: "รหัสผ่านต้องยาว 8 ถึง 64 ตัวอักษร" },
    });
    expect((await open(ResetPasswordPage(props({ token })))).html).toContain('type="password"');
    expect(await canLogIn("somchai@example.com", TEST_PASSWORD)).toBe(true);
  });

  test("ACC-010 หน้าตั้งรหัสผ่านใหม่โหลดไม่ขึ้น เห็นข้อความตาม ACC-014 พร้อมปุ่มลองใหม่", async () => {
    const html = renderToStaticMarkup(<ResetPasswordError error={new Error("ล่ม")} retry={() => {}} />);
    expect(html).toContain("ทำรายการไม่สำเร็จ กรุณาลองใหม่");
    expect(html).toContain("ลองใหม่");
    db.close();
    await expect(open(ResetPasswordPage(props({ token: "abc" })))).rejects.toThrow();
  });
});

describe("ACC-Q05 อีเมลตั้งรหัสผ่านใหม่", () => {
  test("ACC-Q05 ระบบส่งอีเมลล่ม คนที่ขอยังเห็นข้อความเดิม และกดขอลิงก์ใหม่ได้", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "no-reply@blanksong.example");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    addAccount(db, { email: "somchai@example.com" });

    const first = await submit(requestPasswordResetAction(form({ email: "somchai@example.com" })));
    await expect(request.after[0]()).rejects.toThrow(/503/);
    const second = await submit(requestPasswordResetAction(form({ email: "somchai@example.com" })));

    expect(first.state).toEqual({ notice: "ถ้าอีเมลนี้มีบัญชี เราส่งลิงก์ตั้งรหัสผ่านใหม่ให้แล้ว" });
    expect(second).toEqual(first);
    expect(request.after).toHaveLength(2);
  });
});

describe("ACC-014 หน้าโปรไฟล์โหลดไม่ขึ้น", () => {
  test("ACC-014 หน้าผิดพลาดของโปรไฟล์ใช้ข้อความตาม requirement พร้อมปุ่มลองใหม่", () => {
    const html = renderToStaticMarkup(<ProfileError error={new Error("ล่ม")} retry={() => {}} />);
    expect(html).toContain("ทำรายการไม่สำเร็จ กรุณาลองใหม่");
    expect(html).toContain("ลองใหม่");
  });

  test("ACC-014 ฐานข้อมูลล่มตอนเปิดโปรไฟล์ โยน error ให้หน้าผิดพลาดแสดงแทนหน้าเปล่า", async () => {
    signInAs(addAccount(db).id);
    db.close();
    await expect(open(ProfilePage(props()))).rejects.toThrow();
  });
});

describe("ACC-Q03 ใช้ง่าย", () => {
  test("ACC-Q03 หน้าสมัครมีแค่ 3 ช่องกับปุ่มเดียว ไม่มีช่องเลือกบทบาท และมีทางไปหน้าเข้าสู่ระบบ", async () => {
    const { html } = await open(SignupPage());

    expect(html?.match(/<input [^>]*name="(\w+)"/g)?.map((input) => input.match(/name="(\w+)"/)?.[1])).toEqual([
      "email",
      "password",
      "displayName",
    ]);
    expect(html).not.toMatch(/<select|role|isAdmin/i);
    expect(html).toContain('href="/login"');
  });

  test("ACC-Q03 ส่งข้อมูลเพิ่มเพื่อขอเป็นผู้ดูแลแพลตฟอร์ม ระบบไม่สนใจ", async () => {
    const data = form({ email: "manee@example.com", password: "manee12345", displayName: "มานี", isAdmin: "1", is_admin: "1" });
    await submit(signUpAction(data));
    expect((await getCurrentAccount())?.isAdmin).toBe(false);
  });
});

describe("ACC-Q04 รหัสผ่านไม่อยู่ในหน้าเว็บ", () => {
  const password = "จำง่าย1234";

  test("ACC-Q04 หลังสมัคร ทุกหน้าของ feature นี้และแถบด้านบนไม่มีรหัสผ่าน", async () => {
    await submit(signUpAction(form({ email: "q04@example.com", password, displayName: "ทดสอบ" })));
    const pages = [
      (await open(ProfilePage(props()))).html,
      (await open(ProfilePage(props({ edit: "1" })))).html,
      await header(),
    ];
    request.cookies.clear();
    pages.push((await open(LoginPage(props()))).html, (await open(SignupPage())).html);

    for (const html of pages) {
      expect(html).toBeTruthy();
      expect(html).not.toContain(password);
      // ฟอร์มแบบ GET จะใส่รหัสผ่านไว้ในที่อยู่หน้าเว็บถ้ากดก่อนหน้าโหลดเสร็จ
      // ฟอร์มที่ผูก server action ไว้กับ prop action ได้ POST จาก Next.js เอง ตัวเรนเดอร์ของ test ทำแทนไม่ได้
      for (const tag of html?.match(/<form[^>]*>/g) ?? []) {
        if (!tag.includes('action="javascript:')) expect(tag).toMatch(/method="post"/i);
      }
    }
  });

  test("ACC-Q04 ผลที่ส่งกลับไปหน้าเว็บตอนผิดพลาดไม่มีรหัสผ่าน", async () => {
    await signUp(db, { email: "q04@example.com", password, displayName: "ทดสอบ" });
    const results = [
      await submit(logInAction(form({ email: "q04@example.com", password: `${password}x` }))),
      await submit(signUpAction(form({ email: "q04@example.com", password, displayName: "ทดสอบ" }))),
    ];
    for (const result of results) expect(JSON.stringify(result)).not.toContain(password);
  });
});

describe("ACC-Q07 เปิดบนมือถือ", () => {
  test("ACC-Q07 สไตล์ของ feature นี้ไม่มีความกว้างตายตัวที่เกินจอ 360 จุด", () => {
    const css = readFileSync(join(process.cwd(), "src/features/account/components/account.module.css"), "utf8");
    const fixed = [...css.matchAll(/(?<!max-)width:\s*(\d+)px/g)].map((match) => Number(match[1]));
    expect(fixed.filter((px) => px > 328)).toEqual([]);
  });

  test("ACC-Q07 ทุกช่องกรอกกว้างเต็มจอ และทุกปุ่มใช้สไตล์ปุ่มที่สูง 44 จุด", async () => {
    signInAs(addAccount(db).id);
    const pages = [(await open(ProfilePage(props()))).html ?? "", (await open(ProfilePage(props({ edit: "1" })))).html ?? ""];
    request.cookies.clear();
    pages.push((await open(LoginPage(props()))).html ?? "", (await open(SignupPage())).html ?? "");
    const token = resetLink(addAccount(db).email);
    pages.push(
      (await open(Promise.resolve(ForgotPasswordPage()))).html ?? "",
      (await open(ResetPasswordPage(props({ token })))).html ?? "",
      (await open(ResetPasswordPage(props()))).html ?? "",
    );

    for (const html of pages) {
      for (const input of html.match(/<input [^>]*>/g) ?? []) {
        if (!input.includes('type="hidden"')) expect(input).toContain('class="input"');
      }
      for (const button of html.match(/<button [^>]*>/g) ?? []) expect(button).toMatch(/class="button/);
    }
  });
});
