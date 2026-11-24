import { beforeEach, describe, expect, test } from "vitest";
import { findAccountBySessionToken } from "@/features/account/server/sessions";
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
