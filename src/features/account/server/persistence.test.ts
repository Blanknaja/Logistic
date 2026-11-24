import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { getProfile, logIn, signUp, updateProfile } from "@/features/account/server/accounts";
import { resumeSession } from "@/features/account/server/sessions";
import { openDb } from "@/shared/db";

let folder: string;
let path: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "blanksong-acc-"));
  path = join(folder, "test.db");
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

const people = [1, 2, 3].map((n) => ({ email: `q06-${n}@example.com`, password: `password-${n}`, displayName: `คนที่ ${n}` }));

describe("ACC-Q06 การเก็บข้อมูล", () => {
  test("ACC-Q06 สมัคร 3 บัญชี ปิดแล้วเปิดระบบใหม่ เข้าสู่ระบบได้ครบ และโปรไฟล์อยู่ครบ", async () => {
    const before = openDb(path);
    const ids: number[] = [];
    for (const person of people) {
      const result = await signUp(before, person);
      if (!result.ok) throw new Error("ต้องสมัครได้");
      ids.push(result.accountId);
    }
    updateProfile(before, ids[0], { displayName: "คนที่ 1 แก้แล้ว", phone: "0812345678" });
    before.close();

    const after = openDb(path);
    for (const person of people) expect(await logIn(after, person)).toMatchObject({ ok: true });
    expect(getProfile(after, ids[0])).toEqual({ email: "q06-1@example.com", displayName: "คนที่ 1 แก้แล้ว", phone: "0812345678" });
    after.close();
  });

  test("ACC-Q06 เปิดระบบใหม่แล้ว เครื่องที่เข้าสู่ระบบไว้ยังอยู่ในระบบ และรหัสผิดยังเข้าไม่ได้", async () => {
    const before = openDb(path);
    const result = await signUp(before, people[0]);
    if (!result.ok) throw new Error("ต้องสมัครได้");
    before.close();

    const after = openDb(path);
    expect(resumeSession(after, result.token).account?.email).toBe("q06-1@example.com");
    expect(await logIn(after, { email: people[0].email, password: "wrong-pass" })).toMatchObject({ ok: false });
    after.close();
  });
});
