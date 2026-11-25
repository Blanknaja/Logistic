import { beforeEach, describe, expect, test } from "vitest";
import {
  EMAIL_TAKEN,
  getProfile,
  logIn,
  signUp,
  SUSPENDED,
  updateProfile,
  WRONG_LOGIN,
} from "@/features/account/server/accounts";
import { resumeSession } from "@/features/account/server/sessions";
import type { Db } from "@/shared/db";
import { addAccount, TEST_PASSWORD } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";

let db: Db;

beforeEach(() => {
  db = createTestDb();
});

/** เวลาประเทศไทย เช่น at("14:05") */
const at = (time: string, day = "2026-11-24") => new Date(`${day}T${time}+07:00`);
const countAccounts = () => (db.prepare("SELECT count(*) AS n FROM accounts").get() as { n: number }).n;
const somchai = { email: "somchai@example.com", password: "somchai123", displayName: "สมชาย" };

describe("ACC-001 สมัครบัญชี", () => {
  test("ACC-001 สมัครแล้วได้บัญชีทั่วไปที่ใช้งานได้ และเข้าสู่ระบบให้ทันที", async () => {
    const result = await signUp(db, somchai, at("09:01"));
    if (!result.ok) throw new Error("ต้องสมัครได้");

    expect(resumeSession(db, result.token, at("09:01")).account).toMatchObject({
      displayName: "สมชาย",
      isAdmin: false,
      shopId: null,
    });
    expect(db.prepare("SELECT status, is_admin FROM accounts").all()).toEqual([{ status: "ใช้งานได้", is_admin: 0 }]);
  });

  test("ACC-001 ปิดหน้าโดยไม่กดสมัคร ไม่มีบัญชีถูกสร้าง และอีเมลนั้นยังสมัครได้", async () => {
    expect(countAccounts()).toBe(0);
    expect((await signUp(db, somchai, at("09:05"))).ok).toBe(true);
  });
});

describe("ACC-002 ข้อมูลสมัครซ้ำหรือไม่ครบ", () => {
  test("ACC-002 อีเมลที่มีบัญชีแล้วไม่สนตัวพิมพ์เล็กใหญ่ ไม่สร้างบัญชีเพิ่ม", async () => {
    addAccount(db, { email: "somchai@example.com" });
    const result = await signUp(db, { email: "Somchai@Example.com", password: "123456789", displayName: "สมหญิง" });

    expect(result).toEqual({ ok: false, errors: { email: EMAIL_TAKEN } });
    expect(EMAIL_TAKEN).toBe("อีเมลนี้มีบัญชีแล้ว เข้าสู่ระบบหรือกดลืมรหัสผ่าน");
    expect(countAccounts()).toBe(1);
  });

  test("ACC-002 ช่องผิดหลายช่อง บอกเหตุผลครบทุกช่อง และไม่สร้างบัญชี", async () => {
    const result = await signUp(db, { email: "somying@", password: "12345", displayName: "" });

    expect(result).toEqual({
      ok: false,
      errors: {
        email: "รูปแบบอีเมลไม่ถูกต้อง",
        password: "รหัสผ่านต้องยาว 8 ถึง 64 ตัวอักษร",
        displayName: "กรุณาใส่ชื่อที่แสดง",
      },
    });
    expect(countAccounts()).toBe(0);
  });

  test("ACC-002 ช่องว่างทุกช่องและค่าที่ยาวเกิน ได้ข้อความใต้ช่องนั้น", async () => {
    expect(await signUp(db, { email: "", password: "", displayName: "   " })).toMatchObject({
      errors: { email: "กรุณาใส่อีเมล", password: "รหัสผ่านต้องยาว 8 ถึง 64 ตัวอักษร", displayName: "กรุณาใส่ชื่อที่แสดง" },
    });
    expect(await signUp(db, { email: "a@b.co", password: "ก".repeat(65), displayName: "ช".repeat(51) })).toMatchObject({
      errors: { password: "รหัสผ่านต้องยาว 8 ถึง 64 ตัวอักษร", displayName: "ชื่อที่แสดงต้องยาว 1 ถึง 50 ตัวอักษร" },
    });
  });

  test("ACC-002 สองคนสมัครอีเมลเดียวกันพร้อมกัน คนแรกได้บัญชี อีกคนเห็นว่าอีเมลนี้มีบัญชีแล้ว", async () => {
    const results = await Promise.all([
      signUp(db, { email: "wichai@example.com", password: "wichai1234", displayName: "วิชัย" }),
      signUp(db, { email: "wichai@example.com", password: "manee12345", displayName: "มานี" }),
    ]);

    // ใครได้ก่อนขึ้นกับว่า hash รหัสของใครเสร็จก่อน
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toEqual({ ok: false, errors: { email: EMAIL_TAKEN } });
    expect(countAccounts()).toBe(1);
  });
});

describe("ACC-003 ACC-004 เข้าสู่ระบบ", () => {
  test("ACC-003 อีเมลไม่สนตัวพิมพ์เล็กใหญ่ เข้าสู่ระบบได้และได้ชื่อของบัญชี", async () => {
    await signUp(db, somchai);
    const result = await logIn(db, { email: "SOMCHAI@example.com", password: "somchai123" }, at("14:05"));
    if (!result.ok) throw new Error(result.error);

    expect(resumeSession(db, result.token, at("14:05")).account?.displayName).toBe("สมชาย");
  });

  test("ACC-004 รหัสผิดกับอีเมลที่ไม่มีบัญชี ได้ข้อความเดียวกัน", async () => {
    addAccount(db, { email: "somchai@example.com" });

    expect(await logIn(db, { email: "somchai@example.com", password: "wrong-pass" })).toEqual({
      ok: false,
      error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
    });
    expect(await logIn(db, { email: "nobody@example.com", password: TEST_PASSWORD })).toEqual({ ok: false, error: WRONG_LOGIN });
  });

  test("ACC-004 ผิดครบ 5 ครั้งใน 15 นาที ถูกพัก 15 นาทีแม้รหัสถูก แล้วเข้าได้หลังพ้นเวลา", async () => {
    addAccount(db, { email: "somchai@example.com" });
    for (const time of ["14:05", "14:06", "14:07", "14:08", "14:09"]) {
      await logIn(db, { email: "somchai@example.com", password: "wrong-pass" }, at(time));
    }

    expect(await logIn(db, { email: "somchai@example.com", password: TEST_PASSWORD }, at("14:10"))).toEqual({
      ok: false,
      error: "ลองผิดหลายครั้งเกินไป ลองใหม่ได้หลัง 14:24",
    });
    expect(await logIn(db, { email: "Somchai@example.com", password: TEST_PASSWORD }, at("14:23"))).toMatchObject({ ok: false });
    expect(await logIn(db, { email: "somchai@example.com", password: TEST_PASSWORD }, at("14:25"))).toMatchObject({ ok: true });
  });

  test("ACC-004 ผิด 4 ครั้งยังไม่ถูกพัก และครั้งที่ผิดห่างกันเกิน 15 นาทีไม่นับรวมกัน", async () => {
    addAccount(db, { email: "somchai@example.com" });
    for (const time of ["13:00", "13:10", "13:20", "13:30"]) {
      await logIn(db, { email: "somchai@example.com", password: "wrong-pass" }, at(time));
    }
    expect(await logIn(db, { email: "somchai@example.com", password: TEST_PASSWORD }, at("13:31"))).toMatchObject({ ok: true });
    await logIn(db, { email: "somchai@example.com", password: "wrong-pass" }, at("13:40"));
    expect(await logIn(db, { email: "somchai@example.com", password: TEST_PASSWORD }, at("13:41"))).toMatchObject({ ok: true });
  });
});

describe("ACC-005 บัญชีที่ถูกระงับ", () => {
  test("ACC-005 รหัสถูกแต่บัญชีถูกระงับ เข้าสู่ระบบไม่ได้ไม่ว่าจะลองกี่ครั้ง", async () => {
    addAccount(db, { email: "prayut@example.com", status: "ถูกระงับ" });
    for (let i = 0; i < 6; i++) {
      expect(await logIn(db, { email: "prayut@example.com", password: TEST_PASSWORD })).toEqual({
        ok: false,
        error: "บัญชีนี้ถูกระงับ กรุณาติดต่อผู้ดูแลแพลตฟอร์ม",
      });
    }
    expect(SUSPENDED).toBe("บัญชีนี้ถูกระงับ กรุณาติดต่อผู้ดูแลแพลตฟอร์ม");
  });

  test("ACC-005 รหัสผิดของบัญชีที่ถูกระงับ ไม่บอกว่าบัญชีถูกระงับ", async () => {
    addAccount(db, { email: "prayut@example.com", status: "ถูกระงับ" });
    expect(await logIn(db, { email: "prayut@example.com", password: "wrong-pass" })).toEqual({ ok: false, error: WRONG_LOGIN });
  });
});

describe("ACC-011 ACC-012 โปรไฟล์", () => {
  test("ACC-011 ได้อีเมล ชื่อที่แสดง และเบอร์โทรของบัญชีนั้นเท่านั้น", () => {
    const somying = addAccount(db, { email: "somying@example.com", displayName: "สมหญิง", phone: "0812345678" });
    addAccount(db, { email: "other@example.com", displayName: "คนอื่น", phone: "0899999999" });

    expect(getProfile(db, somying.id)).toEqual({ email: "somying@example.com", displayName: "สมหญิง", phone: "0812345678" });
  });

  test("ACC-011 บัญชีที่ยังไม่ใส่เบอร์โทร ได้เบอร์โทรเป็น null", () => {
    const account = addAccount(db, { displayName: "สมชาย" });
    expect(getProfile(db, account.id)?.phone).toBeNull();
  });

  test("ACC-012 บันทึกชื่อและเบอร์ใหม่ แถบด้านบนได้ชื่อใหม่ในการเปิดหน้าครั้งถัดไป", async () => {
    const created = await signUp(db, somchai);
    if (!created.ok) throw new Error("ต้องสมัครได้");

    expect(updateProfile(db, created.accountId, { displayName: " สมชาย ใจดี ", phone: "0898765432" })).toEqual({ ok: true });
    expect(getProfile(db, created.accountId)).toMatchObject({ displayName: "สมชาย ใจดี", phone: "0898765432" });
    expect(resumeSession(db, created.token).account?.displayName).toBe("สมชาย ใจดี");

    updateProfile(db, created.accountId, { displayName: "สมชาย ใจดี", phone: "" });
    expect(getProfile(db, created.accountId)?.phone).toBeNull();
  });

  test("ACC-012 ชื่อว่างและเบอร์ผิดรูปแบบ ได้ข้อความ 2 จุด และค่าเดิมไม่เปลี่ยน", () => {
    const account = addAccount(db, { displayName: "สมชาย ใจดี", phone: "0898765432" });

    expect(updateProfile(db, account.id, { displayName: "", phone: "12345" })).toEqual({
      ok: false,
      errors: { displayName: "กรุณาใส่ชื่อที่แสดง", phone: "เบอร์โทรต้องเป็นตัวเลข 10 หลัก ขึ้นต้นด้วย 0" },
    });
    expect(getProfile(db, account.id)).toMatchObject({ displayName: "สมชาย ใจดี", phone: "0898765432" });
  });

  test("ACC-012 บันทึกจากสองเครื่อง ค่าที่ระบบรับทีหลังเป็นค่าที่ใช้", () => {
    const account = addAccount(db, { displayName: "สมชาย ใจดี" });

    expect(updateProfile(db, account.id, { displayName: "ชาย A", phone: "" }, at("16:20:00"))).toEqual({ ok: true });
    expect(updateProfile(db, account.id, { displayName: "ชาย B", phone: "" }, at("16:20:05"))).toEqual({ ok: true });
    expect(getProfile(db, account.id)?.displayName).toBe("ชาย B");
  });
});

describe("ACC-Q04 รหัสผ่านไม่รั่ว", () => {
  const password = "จำง่าย1234";

  test("ACC-Q04 ผลการสมัคร ข้อมูลที่เก็บ และโปรไฟล์ ไม่มีรหัสผ่าน", async () => {
    const result = await signUp(db, { email: "q04@example.com", password, displayName: "ทดสอบ" });
    if (!result.ok) throw new Error("ต้องสมัครได้");

    expect(JSON.stringify(result)).not.toContain(password);
    expect(JSON.stringify(db.prepare("SELECT * FROM accounts").all())).not.toContain(password);
    expect(JSON.stringify(getProfile(db, result.accountId))).not.toContain(password);
    expect(JSON.stringify(resumeSession(db, result.token))).not.toContain(password);
  });

  test("ACC-Q04 ข้อความตอนผิดพลาดไม่มีรหัสผ่านที่ส่งมา", async () => {
    await signUp(db, { email: "q04@example.com", password, displayName: "ทดสอบ" });

    const failures = await Promise.all([
      logIn(db, { email: "q04@example.com", password: `${password}x` }),
      signUp(db, { email: "q04@example.com", password, displayName: "" }),
      signUp(db, { email: "bad", password: "สั้น", displayName: "ทดสอบ" }),
    ]);
    for (const failure of failures) {
      expect(failure.ok).toBe(false);
      expect(JSON.stringify(failure)).not.toContain(password);
      expect(JSON.stringify(failure)).not.toContain("สั้น");
    }
  });
});

describe("ACC-Q02 ความเร็วของการสมัครบัญชีและเข้าสู่ระบบ", () => {
  const LIMIT_MS = 2000;
  const timed = async <T>(work: () => Promise<T>) => {
    const start = performance.now();
    await work();
    return performance.now() - start;
  };

  test("ACC-Q02 20 คนสมัครแล้วเข้าสู่ระบบพร้อมกัน ทุกคนได้ผลภายใน 2 วินาที", async () => {
    const people = Array.from({ length: 20 }, (_, i) => ({ email: `q02-${i}@example.com`, password: "password123", displayName: `คนที่ ${i}` }));

    const signUps = await Promise.all(people.map((person) => timed(() => signUp(db, person))));
    const logIns = await Promise.all(people.map((person) => timed(() => logIn(db, person))));

    expect(countAccounts()).toBe(20);
    expect(Math.max(...signUps, ...logIns)).toBeLessThan(LIMIT_MS);
  });

  test("ACC-Q02 20 คนกรอกรหัสผิดพร้อมกัน ทุกคนเห็นข้อความผิดภายใน 2 วินาที", async () => {
    addAccount(db, { email: "q02@example.com" });
    const times = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        timed(async () => {
          const email = i % 2 ? "nobody@example.com" : "q02@example.com";
          expect(await logIn(db, { email, password: "wrong-pass" })).toMatchObject({ ok: false });
        }),
      ),
    );
    expect(Math.max(...times)).toBeLessThan(LIMIT_MS);
  });
});
