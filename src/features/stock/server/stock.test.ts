import { beforeEach, describe, expect, test } from "vitest";
import type { Db } from "@/shared/db";
import { addAccount, addOrder, addProduct, addShop } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";
import { STOCK_CHANGE_REASON } from "@/shared/statuses";
import { stockLabel } from "./labels";
import { getStockHistory, listStock, parseStockInput, setStock } from "./stock";

let db: Db;
beforeEach(() => {
  db = createTestDb();
});

const at = (time: string) => new Date(`2026-11-25T${time}:00+07:00`);
const stockOf = (variantId: number) =>
  (db.prepare("SELECT stock FROM variants WHERE id = ?").get(variantId) as { stock: number }).stock;
const historyCount = (variantId: number) =>
  (db.prepare("SELECT count(*) AS n FROM stock_history WHERE variant_id = ?").get(variantId) as { n: number }).n;
const orderStatus = (orderId: number) =>
  (db.prepare("SELECT status FROM orders WHERE id = ?").get(orderId) as { status: string }).status;

/** ร้านของสมชายพร้อมสินค้าหนึ่งรายการที่มีแบบย่อยเดียว */
function somchaiWith(name: string, stock: number) {
  const shop = addShop(db, { name: "สมชายสปอร์ต" });
  const product = addProduct(db, { shopId: shop.id, name, stock });
  return { shop, variantId: product.variantIds[0] };
}

/** คำสั่งซื้อที่รอจ่ายเงิน ซึ่งจองสต็อกไว้แล้ว (การจองจริงเป็นงานของ ticket กดสั่งซื้อ) */
function reserve(variantId: number, quantity: number) {
  const buyer = addAccount(db, { displayName: "มานี" });
  return addOrder(db, { buyerAccountId: buyer.id, items: [{ variantId, quantity }] });
}

/** คำสั่งซื้อถูกยกเลิกและคืนสต็อก แบบเดียวกับที่ ticket กดสั่งซื้อจะเขียน */
function cancelAndReturn(order: { id: number }, variantId: number, quantity: number, now: Date) {
  db.prepare("UPDATE orders SET status = 'ยกเลิก', cancelled_at = ? WHERE id = ?").run(now.toISOString(), order.id);
  db.prepare("UPDATE variants SET stock = stock + ? WHERE id = ?").run(quantity, variantId);
  db.prepare(
    "INSERT INTO stock_history (variant_id, reason, change, stock_after, order_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(variantId, STOCK_CHANGE_REASON.returned, quantity, stockOf(variantId), order.id, now.toISOString());
}

describe("INV-001 แสดงหน้าสต็อก", () => {
  test("INV-001 หนึ่งแถวต่อหนึ่งแบบย่อย มีสต็อก จำนวนที่จองอยู่ และป้าย", () => {
    const shop = addShop(db, { name: "สมชายสปอร์ต" });
    const shirt = addProduct(db, {
      shopId: shop.id,
      name: "เสื้อยืดคอกลม",
      options: [
        { name: "สี", values: ["แดง"] },
        { name: "ขนาด", values: ["M", "L"] },
      ],
      variants: [{ stock: 12 }, { stock: 3 }],
    });
    reserve(shirt.variantIds[0], 2);

    expect(listStock(db, shop.id).rows).toEqual([
      { variantId: shirt.variantIds[0], productName: "เสื้อยืดคอกลม", variantLabel: "แดง M", stock: 12, reserved: 2, label: null },
      { variantId: shirt.variantIds[1], productName: "เสื้อยืดคอกลม", variantLabel: "แดง L", stock: 3, reserved: 0, label: "ใกล้หมด" },
    ]);
  });

  test("INV-001 ไม่แสดงสินค้าที่ลบแล้วและแบบย่อยที่เลิกใช้ เรียงตามชื่อสินค้า หน้าละ 20 แถว", () => {
    const shop = addShop(db);
    addProduct(db, { shopId: shop.id, name: "ข ลบแล้ว", status: "ลบแล้ว" });
    const removed = addProduct(db, { shopId: shop.id, name: "ค เลิกใช้" });
    db.prepare("UPDATE variants SET removed_at = ? WHERE id = ?").run(new Date().toISOString(), removed.variantIds[0]);
    addProduct(db, { shopId: shop.id, name: "ร่าง", status: "ร่าง" });
    for (let i = 24; i >= 1; i--) addProduct(db, { shopId: shop.id, name: `ก${String(i).padStart(2, "0")}` });

    const first = listStock(db, shop.id);
    expect(first.counts.all).toBe(25);
    expect(first.rows).toHaveLength(20);
    expect(first.rows[0].productName).toBe("ก01");
    expect(first.pageCount).toBe(2);
    const second = listStock(db, shop.id, { page: 2 });
    expect(second.rows.map((row) => row.productName)).toEqual(["ก21", "ก22", "ก23", "ก24", "ร่าง"]);
    expect(listStock(db, shop.id, { page: 99 }).page).toBe(2);
  });

  test("INV-001 นับเฉพาะคำสั่งซื้อที่รอจ่ายเงินเป็นจำนวนที่จองอยู่", () => {
    const { shop, variantId } = somchaiWith("ลูกฟุตบอล", 8);
    reserve(variantId, 2);
    const buyer = addAccount(db);
    addOrder(db, { buyerAccountId: buyer.id, items: [{ variantId, quantity: 4 }], status: "จ่ายแล้ว" });
    addOrder(db, { buyerAccountId: buyer.id, items: [{ variantId, quantity: 1 }], status: "ยกเลิก" });

    expect(listStock(db, shop.id).rows[0].reserved).toBe(2);
  });

  test("INV-001 ฐานข้อมูลอ่านไม่ได้ โยน error ให้หน้าแสดงโหลดสต็อกไม่สำเร็จ ไม่ใช่รายการว่าง", () => {
    const { shop } = somchaiWith("ลูกฟุตบอล", 8);
    db.close();
    expect(() => listStock(db, shop.id)).toThrow();
  });

  test("INV-001 ร้านที่ยังไม่มีสินค้าได้รายการว่าง", () => {
    const shop = addShop(db, { name: "สมหญิงเบเกอรี่" });
    expect(listStock(db, shop.id)).toEqual({ rows: [], counts: { all: 0, low: 0, out: 0 }, page: 1, pageCount: 1 });
  });
});

describe("INV-002 ป้ายใกล้หมดและหมด", () => {
  test("INV-002 สต็อก 6 ไม่มีป้าย 1 ถึง 5 ใกล้หมด", () => {
    expect(stockLabel(6)).toBeNull();
    expect(stockLabel(5)).toBe("ใกล้หมด");
    expect(stockLabel(1)).toBe("ใกล้หมด");

    const { shop, variantId } = somchaiWith("รองเท้าวิ่ง", 6);
    expect(listStock(db, shop.id).rows[0].label).toBeNull();
    db.prepare("UPDATE variants SET stock = 5 WHERE id = ?").run(variantId);
    expect(listStock(db, shop.id).rows[0].label).toBe("ใกล้หมด");
  });

  test("INV-002 สต็อก 0 ที่ยังจองอยู่ 2 ได้ป้ายหมด เพราะไม่นับจำนวนที่จองอยู่", () => {
    const { shop, variantId } = somchaiWith("รองเท้าวิ่ง", 0);
    reserve(variantId, 2);
    expect(listStock(db, shop.id).rows[0]).toMatchObject({ stock: 0, reserved: 2, label: "หมด" });
  });
});

describe("INV-003 กรองตามป้ายสต็อก", () => {
  function fortyRows(lowCount: number, outCount: number) {
    const shop = addShop(db);
    const stocks = [...Array(lowCount).fill(3), ...Array(outCount).fill(0)];
    for (let i = 0; i < 40; i++) addProduct(db, { shopId: shop.id, name: `สินค้า ${i}`, stock: stocks[i] ?? 20 });
    return shop;
  }

  test("INV-003 เลือกใกล้หมดเห็น 3 แถว และตัวเลขของทุกตัวกรอง", () => {
    const shop = fortyRows(3, 1);
    const result = listStock(db, shop.id, { filter: "low" });
    expect(result.rows).toHaveLength(3);
    expect(result.rows.every((row) => row.label === "ใกล้หมด")).toBe(true);
    expect(result.counts).toEqual({ all: 40, low: 3, out: 1 });
    expect(listStock(db, shop.id, { filter: "out" }).rows.map((row) => row.stock)).toEqual([0]);
  });

  test("INV-003 ไม่มีแถวที่หมด เลือกหมดได้รายการว่าง และตัวเลขของตัวกรองอื่นยังอยู่", () => {
    const shop = fortyRows(3, 0);
    const result = listStock(db, shop.id, { filter: "out" });
    expect(result.rows).toEqual([]);
    expect(result.counts).toEqual({ all: 40, low: 3, out: 0 });
  });
});

describe("INV-004 ผู้ขายตั้งสต็อก", () => {
  test("INV-004 ตั้ง 3 เป็น 20 ได้สต็อกใหม่ และประวัติ ผู้ขายแก้ +17 เหลือ 20", () => {
    const { shop, variantId } = somchaiWith("เสื้อยืดคอกลม", 3);

    expect(setStock(db, shop.id, { variantId, expected: 3, value: "20" }, at("14:01"))).toEqual({
      outcome: "saved",
      stock: 20,
      reserved: 0,
    });
    expect(listStock(db, shop.id).rows[0]).toMatchObject({ stock: 20, label: null });
    expect(getStockHistory(db, shop.id, variantId)?.entries).toEqual([
      expect.objectContaining({ reason: "ผู้ขายแก้", change: 17, stockAfter: 20, createdAt: at("14:01").toISOString(), orderNo: null }),
    ]);
  });

  test("INV-004 บันทึกล้มกลางทาง สต็อกยังเป็น 3 และประวัติไม่มีบรรทัดใหม่", () => {
    const { shop, variantId } = somchaiWith("เสื้อยืดคอกลม", 3);
    // ประวัติเขียนไม่ได้ สต็อกที่เปลี่ยนไปแล้วต้องย้อนกลับด้วย
    db.exec("CREATE TRIGGER fail_history BEFORE INSERT ON stock_history BEGIN SELECT RAISE(ABORT, 'ล่ม'); END");

    expect(() => setStock(db, shop.id, { variantId, expected: 3, value: "20" })).toThrow();
    expect(stockOf(variantId)).toBe(3);
    expect(historyCount(variantId)).toBe(0);
  });

  test("INV-004 กดบันทึก 20 สองครั้งติดกัน ได้ประวัติบรรทัดเดียว", () => {
    const { shop, variantId } = somchaiWith("เสื้อยืดคอกลม", 3);
    const save = () => setStock(db, shop.id, { variantId, expected: 3, value: "20" });

    expect(save().outcome).toBe("saved");
    expect(save()).toEqual({ outcome: "saved", stock: 20, reserved: 0 });
    expect(stockOf(variantId)).toBe(20);
    expect(historyCount(variantId)).toBe(1);
  });
});

describe("INV-005 ปฏิเสธจำนวนที่ไม่ถูกต้อง", () => {
  test("INV-005 ตั้ง 0 ได้ ป้ายหมด", () => {
    const { shop, variantId } = somchaiWith("ถุงเท้ากีฬา", 8);
    expect(setStock(db, shop.id, { variantId, expected: 8, value: "0" }).outcome).toBe("saved");
    expect(listStock(db, shop.id).rows[0]).toMatchObject({ stock: 0, label: "หมด" });
    expect(parseStockInput("999999")).toBe(999_999);
  });

  test.each(["-1", "2.5", "", "   ", "1000000", "สิบ", "1e3", "1,000"])("INV-005 กรอก %j ไม่เปลี่ยนสต็อก", (value) => {
    const { shop, variantId } = somchaiWith("ถุงเท้ากีฬา", 8);
    expect(setStock(db, shop.id, { variantId, expected: 8, value })).toEqual({ outcome: "invalid", stock: 8, reserved: 0 });
    expect(stockOf(variantId)).toBe(8);
    expect(historyCount(variantId)).toBe(0);
  });
});

describe("INV-006 สต็อกเปลี่ยนระหว่างที่ผู้ขายกำลังแก้", () => {
  test("INV-006 ไม่มีใครสั่งซื้อระหว่างนั้น บันทึก 15 ได้", () => {
    const { shop, variantId } = somchaiWith("ลูกฟุตบอล", 10);
    expect(setStock(db, shop.id, { variantId, expected: 10, value: "15" }, at("16:02")).outcome).toBe("saved");
    expect(stockOf(variantId)).toBe(15);
  });

  test("INV-006 มานีสั่งซื้อ 2 ชิ้นก่อนสมชายกดบันทึก ไม่บันทึก ได้สต็อก 8 จองอยู่ 2 และคำสั่งซื้อยังอยู่", () => {
    const { shop, variantId } = somchaiWith("ลูกฟุตบอล", 10);
    const order = reserve(variantId, 2);
    db.prepare("UPDATE variants SET stock = 8 WHERE id = ?").run(variantId);

    expect(setStock(db, shop.id, { variantId, expected: 10, value: "15" })).toEqual({
      outcome: "changed",
      stock: 8,
      reserved: 2,
    });
    expect(stockOf(variantId)).toBe(8);
    expect(historyCount(variantId)).toBe(0);
    expect(orderStatus(order.id)).toBe("รอจ่ายเงิน");
  });

  test("INV-006 เปิดสองหน้าต่าง หน้าต่างแรกบันทึก 12 ได้ หน้าต่างที่สองบันทึก 30 ไม่ได้และเห็น 12", () => {
    const { shop, variantId } = somchaiWith("ลูกฟุตบอล", 8);
    expect(setStock(db, shop.id, { variantId, expected: 8, value: "12" }).outcome).toBe("saved");
    expect(setStock(db, shop.id, { variantId, expected: 8, value: "30" })).toEqual({
      outcome: "changed",
      stock: 12,
      reserved: 0,
    });
    expect(stockOf(variantId)).toBe(12);
  });
});

describe("INV-007 ผู้ขายตั้งสต็อกต่ำกว่าจำนวนที่จองอยู่", () => {
  test("INV-007 ตั้ง 0 ขณะจองอยู่ 3 ได้สต็อก 0 ป้ายหมด และคำสั่งซื้อของมานียังรอจ่ายเงิน", () => {
    const { shop, variantId } = somchaiWith("ขวดน้ำ 1 ลิตร", 2);
    const order = reserve(variantId, 3);

    expect(setStock(db, shop.id, { variantId, expected: 2, value: "0" }, at("17:01"))).toEqual({
      outcome: "saved",
      stock: 0,
      reserved: 3,
    });
    expect(listStock(db, shop.id).rows[0]).toMatchObject({ stock: 0, reserved: 3, label: "หมด" });
    expect(orderStatus(order.id)).toBe("รอจ่ายเงิน");
  });

  test("INV-007 คำสั่งซื้อถูกยกเลิกทีหลัง สต็อกคืนเป็น 3 จองอยู่ 0 และสมชายตั้งเป็น 0 อีกครั้งได้", () => {
    const { shop, variantId } = somchaiWith("ขวดน้ำ 1 ลิตร", 2);
    const order = reserve(variantId, 3);
    setStock(db, shop.id, { variantId, expected: 2, value: "0" }, at("17:01"));
    cancelAndReturn(order, variantId, 3, at("17:30"));

    expect(listStock(db, shop.id).rows[0]).toMatchObject({ stock: 3, reserved: 0, label: "ใกล้หมด" });
    expect(getStockHistory(db, shop.id, variantId)?.entries[0]).toMatchObject({
      reason: "คืนจากคำสั่งซื้อ",
      change: 3,
      stockAfter: 3,
      orderNo: order.orderNo,
      createdAt: at("17:30").toISOString(),
    });
    expect(setStock(db, shop.id, { variantId, expected: 3, value: "0" }).outcome).toBe("saved");
    expect(stockOf(variantId)).toBe(0);
  });
});

describe("INV-008 กันบัญชีอื่นดูและแก้สต็อก", () => {
  test("INV-008 สมชายเห็นเฉพาะสินค้าของร้านตัวเอง", () => {
    const { shop } = somchaiWith("ลูกฟุตบอล", 12);
    addProduct(db, { shopId: addShop(db, { name: "สมหญิงเบเกอรี่" }).id, name: "ขนมปังเนยสด" });
    expect(listStock(db, shop.id).rows.map((row) => row.productName)).toEqual(["ลูกฟุตบอล"]);
  });

  test("INV-008 สมหญิงเปิดประวัติและบันทึกสต็อกลูกฟุตบอลของสมชายไม่ได้ สต็อกยังเป็น 12", () => {
    const { variantId } = somchaiWith("ลูกฟุตบอล", 12);
    const somying = addShop(db, { name: "สมหญิงเบเกอรี่" });

    expect(getStockHistory(db, somying.id, variantId)).toBeNull();
    expect(setStock(db, somying.id, { variantId, expected: 12, value: "0" })).toEqual({ outcome: "not-found" });
    expect(setStock(db, null, { variantId, expected: 12, value: "0" })).toEqual({ outcome: "not-found" });
    expect(stockOf(variantId)).toBe(12);
    expect(historyCount(variantId)).toBe(0);
  });

  test("INV-008 สินค้าที่ลบแล้วแก้สต็อกไม่ได้", () => {
    const shop = addShop(db);
    const product = addProduct(db, { shopId: shop.id, status: "ลบแล้ว", stock: 4 });
    expect(setStock(db, shop.id, { variantId: product.variantIds[0], expected: 4, value: "9" })).toEqual({
      outcome: "not-found",
    });
  });
});

describe("INV-015 แสดงประวัติสต็อก", () => {
  test("INV-015 สามบรรทัดเรียงใหม่ไปเก่า สองบรรทัดแรกมีเลขคำสั่งซื้อ", () => {
    const { shop, variantId } = somchaiWith("ลูกฟุตบอล", 5);
    setStock(db, shop.id, { variantId, expected: 5, value: "10" }, at("09:00"));
    const order = reserve(variantId, 2);
    db.prepare("UPDATE variants SET stock = 8 WHERE id = ?").run(variantId);
    db.prepare(
      "INSERT INTO stock_history (variant_id, reason, change, stock_after, order_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(variantId, STOCK_CHANGE_REASON.reserved, -2, 8, order.id, at("09:10").toISOString());
    cancelAndReturn(order, variantId, 2, at("09:15"));

    const history = getStockHistory(db, shop.id, variantId);
    expect(history?.entries.map(({ reason, change, stockAfter, orderNo }) => ({ reason, change, stockAfter, orderNo }))).toEqual([
      { reason: "คืนจากคำสั่งซื้อ", change: 2, stockAfter: 10, orderNo: order.orderNo },
      { reason: "จองจากคำสั่งซื้อ", change: -2, stockAfter: 8, orderNo: order.orderNo },
      { reason: "ผู้ขายแก้", change: 5, stockAfter: 10, orderNo: null },
    ]);
    expect(history?.stock).toBe(10);
  });

  test("INV-015 หน้าละ 20 บรรทัด", () => {
    const { shop, variantId } = somchaiWith("ลูกฟุตบอล", 0);
    for (let i = 1; i <= 25; i++) {
      setStock(db, shop.id, { variantId, expected: i - 1, value: String(i) }, new Date(Date.UTC(2026, 10, 25, 0, i)));
    }
    const first = getStockHistory(db, shop.id, variantId);
    expect(first?.entries).toHaveLength(20);
    expect(first?.entries[0].stockAfter).toBe(25);
    expect(first?.pageCount).toBe(2);
    expect(getStockHistory(db, shop.id, variantId, 2)?.entries.map((entry) => entry.stockAfter)).toEqual([5, 4, 3, 2, 1]);
  });

  test("INV-015 แบบย่อยใหม่ยังไม่มีประวัติ ได้รายการว่างพร้อมสต็อก 0", () => {
    const shop = addShop(db, { name: "สมหญิงเบเกอรี่" });
    const bread = addProduct(db, { shopId: shop.id, name: "ขนมปังเนยสด", stock: 0 });
    expect(getStockHistory(db, shop.id, bread.variantIds[0])).toMatchObject({ entries: [], stock: 0, page: 1, pageCount: 1 });
  });

  test("INV-015 ฐานข้อมูลอ่านไม่ได้ โยน error ให้หน้าแสดงโหลดประวัติสต็อกไม่สำเร็จ", () => {
    const { shop, variantId } = somchaiWith("ลูกฟุตบอล", 5);
    db.close();
    expect(() => getStockHistory(db, shop.id, variantId)).toThrow();
  });
});

describe("คุณภาพ", () => {
  /** ข้อมูลขนาดเท่าข้อมูลตัวอย่าง 50 ร้าน 1,000 สินค้า แต่ละแบบย่อยมีประวัติ */
  function sampleSizedData() {
    let first: { shopId: number; variantId: number } | undefined;
    db.exec("BEGIN");
    for (let s = 0; s < 50; s++) {
      const shop = addShop(db);
      for (let p = 0; p < 20; p++) {
        const product = addProduct(db, { shopId: shop.id, stock: (s + p) % 12, recordStockHistory: true });
        first ??= { shopId: shop.id, variantId: product.variantIds[0] };
      }
    }
    db.exec("COMMIT");
    return first!;
  }

  function p95(run: () => void): number {
    const times = Array.from({ length: 100 }, () => {
      const start = performance.now();
      run();
      return performance.now() - start;
    });
    return times.sort((a, b) => a - b)[94];
  }

  test("INV-Q01 หน้าสต็อกและประวัติสต็อกอ่านข้อมูลเสร็จภายใน 2 วินาที ใน 95 จาก 100 ครั้ง", () => {
    const { shopId, variantId } = sampleSizedData();
    expect(p95(() => listStock(db, shopId, { filter: "low" }))).toBeLessThan(2000);
    expect(p95(() => getStockHistory(db, shopId, variantId))).toBeLessThan(2000);
  });

  test("INV-Q03 บันทึกสต็อกเสร็จภายใน 2 วินาที ใน 95 จาก 100 ครั้ง", () => {
    const { shopId, variantId } = sampleSizedData();
    let stock = stockOf(variantId);
    expect(
      p95(() => {
        expect(setStock(db, shopId, { variantId, expected: stock, value: String(stock + 1) }).outcome).toBe("saved");
        stock += 1;
      }),
    ).toBeLessThan(2000);
  });
});
