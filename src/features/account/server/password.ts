import { randomBytes, scrypt, scryptSync, timingSafeEqual, type ScryptOptions } from "node:crypto";

// ค่าเก็บไว้ในตัว hash ด้วย เปลี่ยนค่าทีหลังได้โดย hash เดิมยังตรวจได้
const COST = 32768;
const BLOCK_SIZE = 8;
const PARALLEL = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 128 * 1024 * 1024;

function scryptAsync(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

function encode(salt: Buffer, key: Buffer): string {
  return ["scrypt", COST, BLOCK_SIZE, PARALLEL, salt.toString("base64"), key.toString("base64")].join("$");
}

/** hash รหัสผ่านก่อนเก็บลงฐานข้อมูล */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLEL,
    maxmem: MAX_MEMORY,
  });
  return encode(salt, key);
}

/** แบบ sync สำหรับข้อมูลตัวอย่างและ test เท่านั้น เพราะบล็อกเซิร์ฟเวอร์ระหว่างคำนวณ */
export function hashPasswordSync(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, KEY_LENGTH, { N: COST, r: BLOCK_SIZE, p: PARALLEL, maxmem: MAX_MEMORY });
  return encode(salt, key);
}

/** ตรวจว่ารหัสผ่านตรงกับค่า hash ที่เก็บไว้ไหม */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, cost, blockSize, parallel, saltText, keyText] = stored.split("$");
  if (scheme !== "scrypt" || !saltText || !keyText) return false;
  const expected = Buffer.from(keyText, "base64");
  try {
    const actual = await scryptAsync(password, Buffer.from(saltText, "base64"), expected.length, {
      N: Number(cost),
      r: Number(blockSize),
      p: Number(parallel),
      maxmem: MAX_MEMORY,
    });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
