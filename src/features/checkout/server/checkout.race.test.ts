// กดสั่งซื้อพร้อมกันจริง: แต่ละ worker เปิดการเชื่อมต่อของตัวเองกับไฟล์ฐานข้อมูลเดียวกัน แล้วรอกันที่จุดเริ่มก่อนกดทุกรอบ

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { RaceJob } from "@/features/checkout/server/checkout.race-worker";
import { getCheckout, type PlaceOrderInput, type PlaceOrderResult } from "@/features/checkout/server/checkout";
import { reservedQuantity } from "@/features/stock/server/reservation";
import { openDb, type Db } from "@/shared/db";
import { addAccount, addAddress, addCartItem, addProduct } from "@/shared/db/builders";
import { STOCK_CHANGE_REASON } from "@/shared/statuses";

let dir: string;
let path: string;
let db: Db;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "blanksong-race-"));
  path = join(dir, "race.db");
  db = openDb(path);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

/** worker หนึ่งตัวต่อผู้กดหนึ่งคน presses[i] คือสิ่งที่คนนั้นกดในรอบที่ i ทุกคนกดรอบเดียวกันพร้อมกัน */
function race(pressesByWorker: PlaceOrderInput[][]): Promise<PlaceOrderResult[][]> {
  const barrier = new SharedArrayBuffer(8);
  return Promise.all(
    pressesByWorker.map(
      (presses) =>
        new Promise<PlaceOrderResult[]>((resolve, reject) => {
          const job: RaceJob = { path, barrier, parties: pressesByWorker.length, presses };
          const worker = new Worker(new URL("./checkout.race-worker.ts", import.meta.url), {
            workerData: job,
            execArgv: ["--import", "tsx"],
          });
          worker.once("message", resolve);
          worker.once("error", reject);
          worker.once("exit", (code) => code !== 0 && reject(new Error(`worker จบด้วยรหัส ${code}`)));
        }),
    ),
  );
}

const stock = (variantId: number) => Number(db.prepare("SELECT stock FROM variants WHERE id = ?").get(variantId)?.stock);
const count = (sql: string, ...params: (string | number)[]) => Number(db.prepare(`SELECT count(*) AS n FROM ${sql}`).get(...params)?.n);

/** ผู้ซื้อที่มีที่อยู่และของในตะกร้า พร้อมสิ่งที่หน้าสั่งซื้อจะส่งเมื่อกด "สั่งซื้อ" */
function buyerAtCheckout(items: { variantId: number; quantity?: number }[]): PlaceOrderInput {
  const buyer = addAccount(db);
  const address = addAddress(db, { accountId: buyer.id, isDefault: true });
  for (const item of items) addCartItem(db, { accountId: buyer.id, ...item });
  const checkout = getCheckout(db, buyer.id);
  return {
    buyerAccountId: buyer.id,
    addressId: address.id,
    orderKey: checkout.orderKey,
    lines: checkout.shops.flatMap((shop) => shop.lines.map((l) => ({ cartItemId: l.cartItemId, quantity: l.quantity, unitPrice: l.unitPrice ?? 0 }))),
  };
}

describe("INV-011 สองคนแย่งชิ้นสุดท้าย", () => {
  test("INV-011 CHK-006 มานีและปิติกดสั่งซื้อรองเท้าชิ้นสุดท้ายพร้อมกัน ได้ของคนเดียว อีกคนเห็น สินค้าหมด", async () => {
    const shoe = addProduct(db, { name: "รองเท้าวิ่ง ขนาด 42", stock: 1 }).variantIds[0];
    const mani = buyerAtCheckout([{ variantId: shoe }]);
    const piti = buyerAtCheckout([{ variantId: shoe }]);

    const [[maniResult], [pitiResult]] = await race([[mani], [piti]]);

    const results = [maniResult, pitiResult];
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const loser = results.findIndex((r) => !r.ok);
    const loserInput = [mani, piti][loser];
    expect(results[loser]).toEqual({ ok: false, problems: { [loserInput.lines[0].cartItemId]: "สินค้าหมด" }, addressProblem: null });
    expect(count("orders")).toBe(1);
    expect(count("orders WHERE buyer_account_id = ?", loserInput.buyerAccountId)).toBe(0);
    expect(count("cart_items WHERE account_id = ?", loserInput.buyerAccountId)).toBe(1);
    expect([stock(shoe), reservedQuantity(db, shoe)]).toEqual([0, 1]);
    expect(count("stock_history WHERE reason = ? AND variant_id = ?", STOCK_CHANGE_REASON.reserved, shoe)).toBe(1);
  });

  test("INV-011 CHK-007 มานีกดสั่งซื้อชิ้นสุดท้ายสองครั้งพร้อมกัน ได้คำสั่งซื้อเดียว สต็อกเป็น 0 ไม่ใช่ -1", async () => {
    const shoe = addProduct(db, { stock: 1 }).variantIds[0];
    const mani = buyerAtCheckout([{ variantId: shoe }]);

    const [[first], [second]] = await race([[mani], [mani]]);

    expect(first.ok && second.ok && first.groupId === second.groupId).toBe(true);
    expect([first, second].filter((r) => r.ok && r.duplicate)).toHaveLength(1);
    expect(count("orders")).toBe(1);
    expect([stock(shoe), reservedQuantity(db, shoe)]).toEqual([0, 1]);
  });
});

describe("CHK-Q02 ไม่ขายเกินและไม่สร้างซ้ำ", () => {
  const ROUNDS = 100;
  const CROWD_ROUNDS = Number(process.env.CHK_Q02_ROUNDS) || 10;

  test(`CHK-Q02 ผู้ซื้อ 20 คนกดสั่งซื้อแก้วน้ำชิ้นสุดท้ายพร้อมกัน ${CROWD_ROUNDS} รอบ ทุกรอบได้คำสั่งซื้อ 1 รายการพอดี อีก 19 คนเห็น สินค้าหมด`, async () => {
    const glasses = Array.from({ length: CROWD_ROUNDS }, () => addProduct(db, { name: "แก้วน้ำ", price: 150, stock: 1 }).variantIds[0]);
    const buyers = Array.from({ length: 20 }, () => buyerAtCheckout(glasses.map((variantId) => ({ variantId }))));
    const presses = buyers.map((buyer) =>
      buyer.lines.map((line, round) => ({ ...buyer, orderKey: `round-${round}`, lines: [line] })),
    );

    const results = await race(presses);

    for (let round = 0; round < CROWD_ROUNDS; round++) {
      const thisRound = results.map((byWorker) => byWorker[round]);
      expect(thisRound.filter((r) => r.ok)).toHaveLength(1);
      expect(thisRound.filter((r) => !r.ok && Object.values(r.problems).includes("สินค้าหมด"))).toHaveLength(19);
    }
    expect(glasses.every((glass) => stock(glass) === 0)).toBe(true);
    expect(count("orders")).toBe(CROWD_ROUNDS);
    expect(db.prepare("SELECT variant_id FROM order_items GROUP BY variant_id HAVING count(*) > 1").all()).toEqual([]);
    // INV-Q05 สต็อกของทุกแถวตรงกับบรรทัดล่าสุดในประวัติ
    expect(
      db
        .prepare(
          `SELECT v.id FROM variants v JOIN stock_history h ON h.id = (SELECT max(id) FROM stock_history WHERE variant_id = v.id)
           WHERE v.stock != h.stock_after`,
        )
        .all(),
    ).toEqual([]);
  }, 60_000);

  test("CHK-Q02 ระบบได้รับการกดสั่งซื้อเดียวกัน 5 ครั้งพร้อมกัน 100 รอบ ทุกรอบได้คำสั่งซื้อ 2 รายการพอดี และสต็อกลดเท่าของ 3 ชิ้น", async () => {
    const shirt = addProduct(db, { price: 200, stock: 1000 }).variantIds[0];
    const glass = addProduct(db, { price: 150, stock: 1000 }).variantIds[0];
    const rounds = Array.from({ length: ROUNDS }, () => buyerAtCheckout([{ variantId: shirt, quantity: 2 }, { variantId: glass }]));

    const results = await race(Array.from({ length: 5 }, () => rounds));

    rounds.forEach((input, round) => {
      const groups = new Set(results.map((byWorker) => (byWorker[round].ok ? byWorker[round].groupId : null)));
      expect([...groups]).toHaveLength(1);
      expect(groups.has(null)).toBe(false);
      expect(count("orders WHERE buyer_account_id = ?", input.buyerAccountId)).toBe(2);
    });
    expect([stock(shirt), stock(glass)]).toEqual([1000 - 2 * ROUNDS, 1000 - ROUNDS]);
    expect(count("stock_history WHERE reason = ?", STOCK_CHANGE_REASON.reserved)).toBe(2 * ROUNDS);
  }, 60_000);
});
