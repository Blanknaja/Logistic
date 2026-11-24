import { beforeEach, describe, expect, test } from "vitest";
import {
  createSession,
  endSession,
  findAccountBySessionToken,
  resumeSession,
} from "@/features/account/server/sessions";
import type { Db } from "@/shared/db";
import { addAccount, addSession, addShop } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";

let db: Db;

beforeEach(() => {
  db = createTestDb();
});

describe("findAccountBySessionToken", () => {
  test("token ที่ยังไม่หมดอายุ ได้บัญชีพร้อมร้านและสิทธิ์ผู้ดูแลแพลตฟอร์ม", () => {
    const seller = addAccount(db, { displayName: "สมชาย" });
    const shop = addShop(db, { ownerAccountId: seller.id });
    const token = addSession(db, seller.id);

    expect(findAccountBySessionToken(db, token)).toEqual({
      id: seller.id,
      email: seller.email,
      displayName: "สมชาย",
      isAdmin: false,
      shopId: shop.id,
    });
  });

  test("บัญชีที่ยังไม่มีร้าน ได้ shopId เป็น null", () => {
    const admin = addAccount(db, { isAdmin: true });
    const result = findAccountBySessionToken(db, addSession(db, admin.id));
    expect(result).toMatchObject({ isAdmin: true, shopId: null });
  });

  test("token ที่ไม่มีอยู่ หมดอายุ หรือของบัญชีที่ถูกระงับ ได้ null", () => {
    const account = addAccount(db);
    const expired = addSession(db, account.id, { expiresAt: "2026-01-01T00:00:00.000Z" });
    const suspended = addAccount(db, { status: "ถูกระงับ" });

    expect(findAccountBySessionToken(db, "no-such-token")).toBeNull();
    expect(findAccountBySessionToken(db, expired)).toBeNull();
    expect(findAccountBySessionToken(db, addSession(db, suspended.id))).toBeNull();
  });
});

const day = (date: string, time = "09:00") => new Date(`${date}T${time}+07:00`);

describe("ACC-006 อยู่ในระบบต่อเนื่อง", () => {
  test("ACC-006 กลับมาวันถัดไปยังอยู่ในระบบ และนับ 30 วันใหม่จากครั้งล่าสุดที่ใช้", () => {
    const somying = addAccount(db, { displayName: "สมหญิง" });
    const token = createSession(db, somying.id, day("2026-11-24"));

    expect(resumeSession(db, token, day("2026-11-25", "08:30")).account?.displayName).toBe("สมหญิง");
    // เกิน 30 วันนับจากตอนเข้าสู่ระบบ แต่ยังไม่ถึง 30 วันนับจากครั้งล่าสุดที่ใช้
    expect(resumeSession(db, token, day("2026-12-24", "10:00")).account?.displayName).toBe("สมหญิง");
  });

  test("ACC-006 ไม่ได้ใช้เกิน 30 วัน ต้องเข้าสู่ระบบอีกครั้ง", () => {
    const somying = addAccount(db);
    const token = createSession(db, somying.id, day("2026-11-24"));

    expect(resumeSession(db, token, day("2026-12-25", "10:00"))).toEqual({ account: null, problem: "relogin" });
    expect(resumeSession(db, "no-such-token")).toEqual({ account: null, problem: "relogin" });
  });
});

describe("ACC-005 เครื่องที่เข้าสู่ระบบค้างไว้ของบัญชีที่ถูกระงับ", () => {
  test("ACC-005 บัญชีที่ใช้งานได้ ใช้ token ต่อได้", () => {
    const prayut = addAccount(db);
    expect(resumeSession(db, createSession(db, prayut.id)).problem).toBeNull();
  });

  test("ACC-005 ถูกระงับหลังเข้าสู่ระบบ เปิดหน้าถัดไปก็ออกจากระบบ พร้อมบอกว่าถูกระงับ", () => {
    const prayut = addAccount(db);
    const token = createSession(db, prayut.id, day("2026-11-24", "12:00"));
    db.prepare("UPDATE accounts SET status = 'ถูกระงับ' WHERE id = ?").run(prayut.id);

    expect(resumeSession(db, token, day("2026-11-24", "13:05"))).toEqual({ account: null, problem: "suspended" });
  });
});

describe("ACC-007 ออกจากระบบ", () => {
  test("ACC-007 ออกจากระบบบนโน้ตบุ๊ก มือถือยังอยู่ในระบบ", () => {
    const somchai = addAccount(db);
    const laptop = createSession(db, somchai.id);
    const mobile = createSession(db, somchai.id);

    endSession(db, laptop);

    expect(resumeSession(db, laptop).account).toBeNull();
    expect(resumeSession(db, mobile).account?.id).toBe(somchai.id);
  });

  test("ACC-007 ออกจากระบบซ้ำด้วย token ที่ใช้ไม่ได้แล้ว ไม่กระทบเครื่องอื่น", () => {
    const somchai = addAccount(db);
    const laptop = createSession(db, somchai.id);
    const mobile = createSession(db, somchai.id);

    endSession(db, laptop);
    endSession(db, laptop);
    endSession(db, "no-such-token");

    expect(resumeSession(db, mobile).account?.id).toBe(somchai.id);
  });
});

describe("ACC-Q01 อ่านการเข้าสู่ระบบด้วย index ไม่ไล่ทั้งตาราง", () => {
  const plan = (sql: string) =>
    (db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all("x") as { detail: string }[]).map((row) => row.detail).join(" | ");

  test("ACC-Q01 หา session จาก token ใช้ index", () => {
    expect(plan("SELECT id FROM sessions WHERE token_hash = ?")).toMatch(/^SEARCH sessions USING .*INDEX/);
  });

  test("ACC-Q01 นับครั้งที่เข้าสู่ระบบผิดของอีเมลใช้ index", () => {
    expect(plan("SELECT failed_at FROM login_failures WHERE email = ? ORDER BY failed_at")).toMatch(
      /^SEARCH login_failures USING .*INDEX login_failures_email/,
    );
  });
});
