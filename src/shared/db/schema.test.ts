import { beforeEach, describe, expect, test } from "vitest";
import type { Db } from "@/shared/db";
import {
  addAccount,
  addAddress,
  addCartItem,
  addOrder,
  addParcel,
  addPayment,
  addProduct,
  addShop,
} from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";
import {
  ACCOUNT_STATUS,
  ORDER_STATUS,
  PARCEL_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  PRODUCT_STATUS,
  RECEIPT_CONFIRMED_BY,
  SHOP_STATUS,
  STOCK_CHANGE_REASON,
} from "@/shared/statuses";

let db: Db;

beforeEach(() => {
  db = createTestDb();
});

function count(table: string): number {
  return Number(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n);
}

describe("โครงข้อมูลตั้งต้น", () => {
  test("มีหมวดหมู่ของแพลตฟอร์มครบ 12 หมวด ตั้งแต่ยังไม่สร้างข้อมูลตัวอย่าง", () => {
    const names = db.prepare("SELECT name FROM categories ORDER BY position").all().map((row) => row.name);
    expect(names).toHaveLength(12);
    expect(names[0]).toBe("เสื้อผ้าและแฟชั่น");
    expect(names[11]).toBe("อื่นๆ");
  });

  test("เก็บเส้นทางหลักครบทุก feature ตั้งแต่บัญชีจนพัสดุส่งสำเร็จ", () => {
    const shop = addShop(db);
    const product = addProduct(db, {
      shopId: shop.id,
      options: [
        { name: "สี", values: ["แดง", "ดำ"] },
        { name: "ขนาด", values: ["S", "M"] },
      ],
      recordStockHistory: true,
    });
    const buyer = addAccount(db);
    addAddress(db, { accountId: buyer.id, isDefault: true });
    addCartItem(db, { accountId: buyer.id, variantId: product.variantIds[0] });
    const order = addOrder(db, {
      buyerAccountId: buyer.id,
      items: [{ variantId: product.variantIds[3], quantity: 2 }],
      status: ORDER_STATUS.paid,
    });
    addPayment(db, { groupId: order.groupId, status: PAYMENT_STATUS.succeeded });
    addParcel(db, { orderId: order.id, status: PARCEL_STATUS.delivered });

    expect(product.variantIds).toHaveLength(4);
    expect(count("stock_history")).toBe(4);
    const item = db.prepare("SELECT variant_label, unit_price FROM order_items").get();
    expect(item).toEqual({ variant_label: "ดำ M", unit_price: 100 });
    expect(db.prepare("SELECT total FROM order_groups").get()?.total).toBe(240);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  test("ทุกคำสถานะใน statuses.ts เก็บลงฐานข้อมูลได้ และคำที่สะกดผิดเก็บไม่ได้", () => {
    const set = (sql: string, values: string[]) => {
      for (const value of values) db.prepare(sql).run(value);
    };
    const shop = addShop(db);
    const product = addProduct(db, { shopId: shop.id });
    const buyer = addAccount(db);
    const order = addOrder(db, { buyerAccountId: buyer.id, items: [{ variantId: product.variantIds[0] }] });
    const payment = addPayment(db, { groupId: order.groupId, status: PAYMENT_STATUS.failed });
    const parcel = addParcel(db, { orderId: order.id });

    set(`UPDATE accounts SET status = ? WHERE id = ${buyer.id}`, Object.values(ACCOUNT_STATUS));
    set(`UPDATE shops SET status = ? WHERE id = ${shop.id}`, Object.values(SHOP_STATUS));
    set(`UPDATE products SET status = ? WHERE id = ${product.id}`, Object.values(PRODUCT_STATUS));
    set(`UPDATE orders SET status = ? WHERE id = ${order.id}`, Object.values(ORDER_STATUS));
    set(`UPDATE payments SET status = ? WHERE id = ${payment.id}`, Object.values(PAYMENT_STATUS));
    set(`UPDATE payments SET method = ? WHERE id = ${payment.id}`, Object.values(PAYMENT_METHOD));
    set(`UPDATE parcels SET status = ? WHERE id = ${parcel.id}`, Object.values(PARCEL_STATUS));
    set(`UPDATE parcels SET receipt_confirmed_by = ? WHERE id = ${parcel.id}`, Object.values(RECEIPT_CONFIRMED_BY));
    set(
      `INSERT INTO stock_history (variant_id, reason, change, stock_after, created_at)
       VALUES (${product.variantIds[0]}, ?, 1, 1, '2026-11-24T00:00:00.000Z')`,
      Object.values(STOCK_CHANGE_REASON),
    );

    expect(() => db.prepare(`UPDATE orders SET status = 'จ่ายแล้ว ' WHERE id = ${order.id}`).run()).toThrow(
      /CHECK constraint/,
    );
  });

  test("สต็อกติดลบไม่ได้ แม้โค้ดจะพลาด", () => {
    const product = addProduct(db, { stock: 1 });
    expect(() => db.prepare("UPDATE variants SET stock = stock - 2 WHERE id = ?").run(product.variantIds[0])).toThrow(
      /CHECK constraint/,
    );
  });

  test("หนึ่งบัญชีมีที่อยู่หลักได้ที่เดียว และเปิดร้านได้ร้านเดียว", () => {
    const account = addAccount(db);
    addAddress(db, { accountId: account.id, isDefault: true });
    expect(() => addAddress(db, { accountId: account.id, isDefault: true })).toThrow(/UNIQUE/);

    addShop(db, { ownerAccountId: account.id });
    expect(() => addShop(db, { ownerAccountId: account.id })).toThrow(/UNIQUE/);
  });

  test("ชื่อร้านซ้ำกันไม่ได้ โดยไม่สนตัวพิมพ์เล็กใหญ่", () => {
    addShop(db, { name: "Blank Shop" });
    expect(() => addShop(db, { name: "blank shop" })).toThrow(/UNIQUE/);
  });
});
