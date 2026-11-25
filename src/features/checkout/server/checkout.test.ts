import { beforeEach, describe, expect, test } from "vitest";
import { CART_CHANGED_MESSAGE, getCheckout, placeOrder, parseCheckoutLines, type Checkout } from "@/features/checkout/server/checkout";
import { reservedQuantity } from "@/features/stock/server/reservation";
import type { Db } from "@/shared/db";
import { addAccount, addAddress, addCartItem, addProduct, addShop } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";
import { ORDER_STATUS, PRODUCT_STATUS, SHOP_STATUS, STOCK_CHANGE_REASON } from "@/shared/statuses";

let db: Db;
beforeEach(() => {
  db = createTestDb();
});

/** เวลาประเทศไทยของวันที่ 2026-11-24 */
const at = (time: string) => new Date(`2026-11-24T${time}+07:00`);

const stock = (variantId: number) => Number(db.prepare("SELECT stock FROM variants WHERE id = ?").get(variantId)?.stock);
const count = (sql: string, ...params: (string | number)[]) => Number(db.prepare(`SELECT count(*) AS n FROM ${sql}`).get(...params)?.n);
const cartCount = (accountId: number) => count("cart_items WHERE account_id = ?", accountId);

function linesOf(checkout: Checkout) {
  return checkout.shops.flatMap((shop) =>
    shop.lines.map((line) => ({ cartItemId: line.cartItemId, quantity: line.quantity, unitPrice: line.unitPrice ?? 0 })),
  );
}

/** กด "สั่งซื้อ" จากหน้าสั่งซื้อที่เปิดไว้ */
function press(buyerId: number, checkout: Checkout, now = at("14:10:00")) {
  return placeOrder(db, { buyerAccountId: buyerId, addressId: checkout.addresses[0]?.id ?? null, orderKey: checkout.orderKey, lines: linesOf(checkout) }, now);
}

/** สมชายเลือกเสื้อยืด 2 ตัวจากร้าน "ผ้าดี" แก้วน้ำ 1 ใบจากร้าน "บ้านแก้ว" และมีหมวกที่ไม่ได้เลือก */
function somchai() {
  const buyer = addAccount(db, { displayName: "สมชาย" });
  const address = addAddress(db, { accountId: buyer.id, isDefault: true });
  const padee = addShop(db, { name: "ผ้าดี" });
  const glassShop = addShop(db, { name: "บ้านแก้ว" });
  const shirt = addProduct(db, { shopId: padee.id, name: "เสื้อยืด", price: 200, stock: 5 }).variantIds[0];
  const hat = addProduct(db, { shopId: padee.id, name: "หมวก", price: 99, stock: 5 }).variantIds[0];
  const glass = addProduct(db, { shopId: glassShop.id, name: "แก้วน้ำ", price: 150, stock: 3 }).variantIds[0];
  const shirtItem = addCartItem(db, { accountId: buyer.id, variantId: shirt, quantity: 2 }).id;
  const glassItem = addCartItem(db, { accountId: buyer.id, variantId: glass, quantity: 1 }).id;
  addCartItem(db, { accountId: buyer.id, variantId: hat, quantity: 1, selected: false });
  return { buyer, address, padee, glassShop, shirt, hat, glass, shirtItem, glassItem };
}

describe("CHK-004 หน้าสั่งซื้อ", () => {
  test("CHK-004 เลือกที่อยู่หลักไว้ให้ แยกตามร้านพร้อมค่าส่ง 40 บาท และยอดรวม 630 บาท", () => {
    const s = somchai();
    addAddress(db, { accountId: s.buyer.id, address: { ...sampleOther, name: "ที่ทำงาน" } });
    const checkout = getCheckout(db, s.buyer.id);

    expect(checkout.addresses[0]).toMatchObject({ id: s.address.id, isDefault: true });
    expect(checkout.addresses).toHaveLength(2);
    expect(checkout.shops.map((shop) => [shop.shopName, shop.itemsTotal, shop.shippingFee, shop.total])).toEqual([
      ["ผ้าดี", 400, 40, 440],
      ["บ้านแก้ว", 150, 40, 190],
    ]);
    expect(checkout.total).toBe(630);
    expect(checkout.canOrder).toBe(true);
  });

  test("CHK-004 ราคาเปลี่ยนหลังใส่ตะกร้า หน้าสั่งซื้อใช้ราคาปัจจุบัน 180 บาท", () => {
    const s = somchai();
    db.prepare("UPDATE variants SET price = 180 WHERE id = ?").run(s.glass);
    const checkout = getCheckout(db, s.buyer.id);

    expect(checkout.shops[1].lines[0].unitPrice).toBe(180);
    expect(checkout.total).toBe(660);
  });

  test("CHK-004 ยังไม่มีที่อยู่ กดสั่งซื้อไม่ได้", () => {
    const buyer = addAccount(db);
    addCartItem(db, { accountId: buyer.id, variantId: addProduct(db, { price: 150 }).variantIds[0] });
    const checkout = getCheckout(db, buyer.id);

    expect(checkout.addresses).toEqual([]);
    expect(checkout.canOrder).toBe(false);
  });

  test("CHK-004 ไม่ได้เลือกสินค้าในตะกร้า ได้หน้าว่าง", () => {
    const s = somchai();
    db.prepare("UPDATE cart_items SET selected = 0 WHERE account_id = ?").run(s.buyer.id);
    expect(getCheckout(db, s.buyer.id)).toMatchObject({ shops: [], total: 0, canOrder: false });
  });

  test("CHK-004 สินค้าหมดก่อนเปิดหน้า แสดง สินค้าหมด และกดสั่งซื้อไม่ได้", () => {
    const s = somchai();
    db.prepare("UPDATE variants SET stock = 0 WHERE id = ?").run(s.glass);
    const checkout = getCheckout(db, s.buyer.id);

    expect(checkout.shops[1].lines[0].problem).toBe("สินค้าหมด");
    expect(checkout.canOrder).toBe(false);
  });

  test("CHK-004 เปิดหน้าแล้วออกไปโดยไม่กดสั่งซื้อ ไม่มีคำสั่งซื้อ สต็อกไม่ถูกจอง ตะกร้าเหมือนเดิม", () => {
    const s = somchai();
    getCheckout(db, s.buyer.id);

    expect(count("orders")).toBe(0);
    expect([stock(s.shirt), stock(s.glass)]).toEqual([5, 3]);
    expect(cartCount(s.buyer.id)).toBe(3);
  });
});

const sampleOther = {
  name: "ที่ทำงาน",
  phone: "0891112222",
  address: "1 ถนนสีลม",
  subdistrict: "สีลม",
  district: "บางรัก",
  province: "กรุงเทพมหานคร",
  postcode: "10500",
};

describe("CHK-005 กดสั่งซื้อ", () => {
  test("CHK-005 ได้คำสั่งซื้อ 2 รายการ รอจ่ายเงิน หมดเขต 14:40 สต็อกถูกจอง และตะกร้าเหลือหมวก", () => {
    const s = somchai();
    const result = press(s.buyer.id, getCheckout(db, s.buyer.id));
    if (!result.ok) throw new Error("ต้องสั่งซื้อสำเร็จ");

    const group = db.prepare("SELECT total, payment_deadline FROM order_groups WHERE id = ?").get(result.groupId);
    expect(group).toEqual({ total: 630, payment_deadline: at("14:40:00").toISOString() });
    const orders = db.prepare("SELECT order_no, status, total, ship_recipient_name FROM orders WHERE group_id = ? ORDER BY id").all(result.groupId);
    expect(orders.map((o) => [o.status, o.total, o.ship_recipient_name])).toEqual([
      [ORDER_STATUS.awaitingPayment, 440, "สมชาย ใจดี"],
      [ORDER_STATUS.awaitingPayment, 190, "สมชาย ใจดี"],
    ]);
    expect(orders.map((o) => o.order_no)).toEqual(["2611240001", "2611240002"]);
    expect([stock(s.shirt), stock(s.glass)]).toEqual([3, 2]);
    expect(db.prepare("SELECT variant_id FROM cart_items WHERE account_id = ?").all(s.buyer.id)).toEqual([{ variant_id: s.hat }]);
  });

  test("CHK-005 คำสั่งซื้อเก็บสำเนาสินค้า แบบย่อย ค่าส่ง และที่อยู่ ร้านหรือผู้ซื้อแก้ทีหลังไม่กระทบ", () => {
    const buyer = addAccount(db);
    addAddress(db, { accountId: buyer.id, isDefault: true, address: sampleOther });
    const shirt = addProduct(db, { name: "เสื้อยืด", price: 200, options: [{ name: "สี", values: ["ดำ"] }, { name: "ขนาด", values: ["L"] }] });
    addCartItem(db, { accountId: buyer.id, variantId: shirt.variantIds[0], quantity: 2 });
    const result = press(buyer.id, getCheckout(db, buyer.id));
    if (!result.ok) throw new Error("ต้องสั่งซื้อสำเร็จ");
    db.prepare("UPDATE variants SET price = 999").run();
    db.prepare("UPDATE products SET name = 'ชื่อใหม่'").run();
    db.prepare("UPDATE product_option_values SET value = 'แดง' WHERE value = 'ดำ'").run();
    db.prepare("UPDATE product_images SET url = '/sample-images/new.svg'").run();
    db.prepare(
      "UPDATE shipping_addresses SET recipient_name = 'คนใหม่', phone = '0899999999', address = 'ที่ใหม่', subdistrict = 'ใหม่', district = 'ใหม่', province = 'เชียงใหม่', postcode = '50000'",
    ).run();

    expect(db.prepare("SELECT product_name, variant_label, unit_price, quantity, cover_image_url FROM order_items").all()).toEqual([
      { product_name: "เสื้อยืด", variant_label: "ดำ L", unit_price: 200, quantity: 2, cover_image_url: `/sample-images/p${shirt.id}-1.svg` },
    ]);
    expect(
      db
        .prepare(
          `SELECT items_total, shipping_fee, total, ship_recipient_name, ship_phone, ship_address, ship_subdistrict, ship_district,
             ship_province, ship_postcode FROM orders WHERE group_id = ?`,
        )
        .all(result.groupId),
    ).toEqual([
      {
        items_total: 400,
        shipping_fee: 40,
        total: 440,
        ship_recipient_name: sampleOther.name,
        ship_phone: sampleOther.phone,
        ship_address: sampleOther.address,
        ship_subdistrict: sampleOther.subdistrict,
        ship_district: sampleOther.district,
        ship_province: sampleOther.province,
        ship_postcode: sampleOther.postcode,
      },
    ]);
  });

  test("CHK-005 ระบบพังระหว่างสร้างคำสั่งซื้อของร้านที่สอง ไม่มีคำสั่งซื้อของร้านใด สต็อกไม่ถูกจอง ตะกร้าเหมือนเดิม", () => {
    const s = somchai();
    db.exec(`CREATE TEMP TRIGGER fail_second_order BEFORE INSERT ON orders WHEN (SELECT count(*) FROM orders) >= 1
             BEGIN SELECT RAISE(ABORT, 'ระบบพัง'); END`);

    expect(() => press(s.buyer.id, getCheckout(db, s.buyer.id))).toThrow("ระบบพัง");
    expect(count("orders")).toBe(0);
    expect(count("order_groups")).toBe(0);
    expect(count("stock_history")).toBe(0);
    expect([stock(s.shirt), stock(s.glass)]).toEqual([5, 3]);
    expect(cartCount(s.buyer.id)).toBe(3);
  });

  test("CHK-005 คำตอบไม่ถึงผู้ซื้อ ถ้าระบบรับไว้แล้ว คำสั่งซื้ออยู่ครบและตะกร้าไม่มีของ 3 ชิ้นนั้น", () => {
    const s = somchai();
    press(s.buyer.id, getCheckout(db, s.buyer.id));
    expect(count("orders WHERE buyer_account_id = ? AND status = ?", s.buyer.id, ORDER_STATUS.awaitingPayment)).toBe(2);
    expect(getCheckout(db, s.buyer.id).shops).toEqual([]);
  });
});

describe("CHK-006 ตรวจสินค้าตอนกดสั่งซื้อ", () => {
  test("CHK-006 ทุกชิ้นผ่าน สร้างคำสั่งซื้อ", () => {
    const s = somchai();
    expect(press(s.buyer.id, getCheckout(db, s.buyer.id))).toMatchObject({ ok: true });
  });

  test("CHK-006 แก้วน้ำหมดก่อนกด ไม่มีคำสั่งซื้อของร้านใด สต็อกเสื้อไม่ถูกจอง ตะกร้าเหมือนเดิม", () => {
    const s = somchai();
    const page = getCheckout(db, s.buyer.id);
    db.prepare("UPDATE variants SET stock = 0 WHERE id = ?").run(s.glass);

    expect(press(s.buyer.id, page)).toEqual({ ok: false, problems: { [s.glassItem]: "สินค้าหมด" }, addressProblem: null });
    expect(count("orders")).toBe(0);
    expect(stock(s.shirt)).toBe(5);
    expect(cartCount(s.buyer.id)).toBe(3);
  });

  test("CHK-006 สต็อกเสื้อเหลือ 1 แต่เลือก 2 ได้ข้อความ เหลือ 1 ชิ้น", () => {
    const s = somchai();
    const page = getCheckout(db, s.buyer.id);
    db.prepare("UPDATE variants SET stock = 1 WHERE id = ?").run(s.shirt);

    expect(press(s.buyer.id, page)).toMatchObject({ ok: false, problems: { [s.shirtItem]: "เหลือ 1 ชิ้น" } });
    expect(count("orders")).toBe(0);
  });

  test("CHK-006 ราคาเปลี่ยนระหว่างอยู่หน้าสั่งซื้อ ไม่สร้างคำสั่งซื้อ แจ้งราคาใหม่ แล้วกดอีกครั้งได้ราคา 180 บาท", () => {
    const s = somchai();
    const page = getCheckout(db, s.buyer.id);
    db.prepare("UPDATE variants SET price = 180 WHERE id = ?").run(s.glass);

    expect(press(s.buyer.id, page)).toMatchObject({ ok: false, problems: { [s.glassItem]: "ราคาเปลี่ยนจาก ฿150 เป็น ฿180" } });
    expect(count("orders")).toBe(0);

    const reloaded = getCheckout(db, s.buyer.id);
    expect(reloaded.total).toBe(660);
    expect(press(s.buyer.id, reloaded)).toMatchObject({ ok: true });
    expect(db.prepare("SELECT unit_price FROM order_items WHERE variant_id = ?").get(s.glass)).toEqual({ unit_price: 180 });
  });

  test("CHK-006 สินค้าของร้านตัวเอง ได้ข้อความ ซื้อสินค้าจากร้านตัวเองไม่ได้", () => {
    const somsri = addAccount(db);
    addAddress(db, { accountId: somsri.id, isDefault: true });
    const shop = addShop(db, { ownerAccountId: somsri.id });
    const item = addCartItem(db, { accountId: somsri.id, variantId: addProduct(db, { shopId: shop.id, price: 150 }).variantIds[0] });
    const page = getCheckout(db, somsri.id);

    expect(page.canOrder).toBe(false);
    expect(press(somsri.id, page)).toMatchObject({ ok: false, problems: { [item.id]: "ซื้อสินค้าจากร้านตัวเองไม่ได้" } });
    expect(count("orders")).toBe(0);
  });

  test("CHK-006 ที่อยู่ที่เลือกถูกลบไปแล้ว ไม่สร้างคำสั่งซื้อ", () => {
    const s = somchai();
    const page = getCheckout(db, s.buyer.id);
    db.prepare("DELETE FROM shipping_addresses WHERE id = ?").run(s.address.id);

    expect(press(s.buyer.id, page)).toEqual({ ok: false, problems: {}, addressProblem: "ที่อยู่ที่เลือกถูกลบไปแล้ว เลือกที่อยู่อื่น" });
    expect(count("orders")).toBe(0);
  });

  test("CHK-006 สินค้าไม่เป็น ขายอยู่ และร้านถูกระงับ ไม่สร้างคำสั่งซื้อ", () => {
    const s = somchai();
    const page = getCheckout(db, s.buyer.id);
    db.prepare("UPDATE products SET status = ? WHERE id = (SELECT product_id FROM variants WHERE id = ?)").run(PRODUCT_STATUS.hidden, s.shirt);
    db.prepare("UPDATE shops SET status = ? WHERE id = ?").run(SHOP_STATUS.suspended, s.glassShop.id);

    expect(press(s.buyer.id, page)).toMatchObject({
      ok: false,
      problems: { [s.shirtItem]: "สินค้านี้ไม่เปิดขายแล้ว", [s.glassItem]: "ร้านนี้ไม่เปิดขายตอนนี้" },
    });
    expect(count("orders")).toBe(0);
  });

  test("CHK-006 รายการในตะกร้าถูกเปลี่ยนจากหน้าต่างอื่น ไม่สร้างคำสั่งซื้อ", () => {
    const s = somchai();
    const page = getCheckout(db, s.buyer.id);
    db.prepare("UPDATE cart_items SET quantity = 3 WHERE id = ?").run(s.shirtItem);
    db.prepare("DELETE FROM cart_items WHERE id = ?").run(s.glassItem);

    expect(press(s.buyer.id, page)).toMatchObject({
      ok: false,
      problems: { [s.shirtItem]: "รายการในตะกร้าเปลี่ยนไปแล้ว กลับไปตรวจที่ตะกร้า", [s.glassItem]: "รายการในตะกร้าเปลี่ยนไปแล้ว กลับไปตรวจที่ตะกร้า" },
    });
  });

  test("CHK-006 รายการของบัญชีอื่นส่งมาไม่ได้", () => {
    const s = somchai();
    const other = addAccount(db);
    addAddress(db, { accountId: other.id, isDefault: true });
    const page = { ...getCheckout(db, s.buyer.id), addresses: getCheckout(db, other.id).addresses };

    expect(press(other.id, page)).toEqual({
      ok: false,
      problems: { [s.shirtItem]: CART_CHANGED_MESSAGE, [s.glassItem]: CART_CHANGED_MESSAGE },
      addressProblem: null,
    });
    expect(count("orders")).toBe(0);
    expect(cartCount(s.buyer.id)).toBe(3);
  });

  test("CHK-006 ส่งที่อยู่ของบัญชีอื่นมา ไม่สร้างคำสั่งซื้อ และไม่จองสต็อก", () => {
    const s = somchai();
    const other = addAccount(db);
    const page = { ...getCheckout(db, s.buyer.id), addresses: [{ ...getCheckout(db, s.buyer.id).addresses[0], id: addAddress(db, { accountId: other.id }).id }] };

    expect(press(s.buyer.id, page)).toEqual({ ok: false, problems: {}, addressProblem: "ที่อยู่ที่เลือกถูกลบไปแล้ว เลือกที่อยู่อื่น" });
    expect(count("orders")).toBe(0);
    expect([stock(s.shirt), stock(s.glass)]).toEqual([5, 3]);
  });

  test("CHK-005 ส่งรายการที่ไม่ได้เลือกในตะกร้ามาเอง ไม่สร้างคำสั่งซื้อ และหมวกยังอยู่ในตะกร้า", () => {
    const s = somchai();
    const page = getCheckout(db, s.buyer.id);
    const hatItem = Number(db.prepare("SELECT id FROM cart_items WHERE variant_id = ?").get(s.hat)?.id);
    const forged = { ...page, lines: [...linesOf(page), { cartItemId: hatItem, quantity: 1, unitPrice: 99 }] };

    expect(
      placeOrder(db, { buyerAccountId: s.buyer.id, addressId: s.address.id, orderKey: page.orderKey, lines: forged.lines }, at("14:10:00")),
    ).toEqual({ ok: false, problems: { [hatItem]: CART_CHANGED_MESSAGE }, addressProblem: null });
    expect(count("orders")).toBe(0);
    expect(stock(s.hat)).toBe(5);
    expect(cartCount(s.buyer.id)).toBe(3);
  });

  test("CHK-006 รายการจากหน้าสั่งซื้อผิดรูปแบบ ถูกปฏิเสธ", () => {
    expect(parseCheckoutLines('[{"cartItemId":1,"quantity":2,"unitPrice":200}]')).toEqual([{ cartItemId: 1, quantity: 2, unitPrice: 200 }]);
    for (const bad of [null, "", "[]", "{}", '[{"cartItemId":1,"quantity":0,"unitPrice":1}]', '[{"cartItemId":1,"quantity":1,"unitPrice":1},{"cartItemId":1,"quantity":1,"unitPrice":1}]']) {
      expect(() => parseCheckoutLines(bad)).toThrow();
    }
  });
});

describe("CHK-007 กดสั่งซื้อซ้ำ", () => {
  test("CHK-007 กดครั้งเดียว ได้คำสั่งซื้อ 2 รายการ", () => {
    const s = somchai();
    press(s.buyer.id, getCheckout(db, s.buyer.id));
    expect(count("orders")).toBe(2);
  });

  test("CHK-007 กด 2 ครั้งติดกันหรือจาก 2 หน้าต่าง ได้กลุ่มเดิม คำสั่งซื้อ 2 รายการ สต็อกเสื้อเหลือ 3 ยอด 630 บาท", () => {
    const s = somchai();
    const firstWindow = getCheckout(db, s.buyer.id);
    const secondWindow = getCheckout(db, s.buyer.id);
    expect(secondWindow.orderKey).toBe(firstWindow.orderKey);

    const first = press(s.buyer.id, firstWindow, at("14:10:00"));
    const second = press(s.buyer.id, secondWindow, at("14:10:01"));

    expect(first).toMatchObject({ ok: true, duplicate: false });
    expect(second).toEqual({ ok: true, groupId: first.ok && first.groupId, duplicate: true });
    expect(count("orders")).toBe(2);
    expect(stock(s.shirt)).toBe(3);
    expect(db.prepare("SELECT sum(total) AS total FROM order_groups").get()?.total).toBe(630);
  });

  test("CHK-007 ใส่ของชุดใหม่ลงตะกร้าหลังสั่งซื้อ ได้หน้าสั่งซื้อใหม่ที่สั่งได้อีกครั้ง", () => {
    const s = somchai();
    const first = getCheckout(db, s.buyer.id);
    press(s.buyer.id, first);
    addCartItem(db, { accountId: s.buyer.id, variantId: s.shirt, quantity: 2 });
    const next = getCheckout(db, s.buyer.id);

    expect(next.orderKey).not.toBe(first.orderKey);
    expect(press(s.buyer.id, next)).toMatchObject({ ok: true, duplicate: false });
    expect(count("order_groups")).toBe(2);
  });
});

describe("INV-009 จองสต็อกเมื่อผู้ซื้อกดสั่งซื้อ", () => {
  function mani() {
    const buyer = addAccount(db, { displayName: "มานี" });
    addAddress(db, { accountId: buyer.id, isDefault: true });
    const ball = addProduct(db, { name: "ลูกฟุตบอล", price: 500, stock: 10 }).variantIds[0];
    const bread = addProduct(db, { name: "ขนมปังเนยสด", price: 45, stock: 6 }).variantIds[0];
    return { buyer, ball, bread };
  }

  test("INV-009 สั่งลูกฟุตบอล 2 และขนมปัง 1 สต็อกเป็น 8 และ 5 จองอยู่ 2 และ 1 และประวัติมีบรรทัด จองจากคำสั่งซื้อ พร้อมเลขคำสั่งซื้อ", () => {
    const m = mani();
    addCartItem(db, { accountId: m.buyer.id, variantId: m.ball, quantity: 2 });
    addCartItem(db, { accountId: m.buyer.id, variantId: m.bread, quantity: 1 });
    press(m.buyer.id, getCheckout(db, m.buyer.id), at("19:00:00"));

    expect([stock(m.ball), stock(m.bread)]).toEqual([8, 5]);
    expect([reservedQuantity(db, m.ball), reservedQuantity(db, m.bread)]).toEqual([2, 1]);
    const history = db
      .prepare(
        `SELECT h.variant_id, h.reason, h.change, h.stock_after, o.order_no FROM stock_history h JOIN orders o ON o.id = h.order_id ORDER BY h.variant_id`,
      )
      .all();
    expect(history.map((h) => [h.variant_id, h.reason, h.change, h.stock_after])).toEqual([
      [m.ball, STOCK_CHANGE_REASON.reserved, -2, 8],
      [m.bread, STOCK_CHANGE_REASON.reserved, -1, 5],
    ]);
    expect(history.every((h) => /^\d{10}$/.test(String(h.order_no)))).toBe(true);
  });

  test("INV-009 ใส่ตะกร้าแล้วปิดหน้าเว็บ ไม่จองสต็อก", () => {
    const m = mani();
    addCartItem(db, { accountId: m.buyer.id, variantId: m.ball, quantity: 2 });
    getCheckout(db, m.buyer.id);

    expect(stock(m.ball)).toBe(10);
    expect(reservedQuantity(db, m.ball)).toBe(0);
  });

  test("INV-009 คำสั่งซื้อเป็น จ่ายแล้ว จองอยู่เป็น 0 และสต็อกยังเป็น 8", () => {
    const m = mani();
    addCartItem(db, { accountId: m.buyer.id, variantId: m.ball, quantity: 2 });
    press(m.buyer.id, getCheckout(db, m.buyer.id));
    db.prepare("UPDATE orders SET status = ?").run(ORDER_STATUS.paid);

    expect(stock(m.ball)).toBe(8);
    expect(reservedQuantity(db, m.ball)).toBe(0);
  });
});

describe("INV-010 สต็อกไม่พอตอนกดสั่งซื้อ", () => {
  function piti() {
    const buyer = addAccount(db, { displayName: "ปิติ" });
    addAddress(db, { accountId: buyer.id, isDefault: true });
    return {
      buyer,
      socks: addProduct(db, { name: "ถุงเท้ากีฬา", stock: 2 }).variantIds[0],
      bottle: addProduct(db, { name: "ขวดน้ำ 1 ลิตร", stock: 0 }).variantIds[0],
      ball: addProduct(db, { name: "ลูกฟุตบอล", stock: 8 }).variantIds[0],
    };
  }

  test("INV-010 สต็อกพอดีจำนวนที่สั่ง สั่งซื้อสำเร็จ ถุงเท้าเหลือ 0 ลูกฟุตบอลเหลือ 7", () => {
    const p = piti();
    addCartItem(db, { accountId: p.buyer.id, variantId: p.socks, quantity: 2 });
    addCartItem(db, { accountId: p.buyer.id, variantId: p.ball, quantity: 1 });

    expect(press(p.buyer.id, getCheckout(db, p.buyer.id))).toMatchObject({ ok: true });
    expect([stock(p.socks), stock(p.ball)]).toEqual([0, 7]);
  });

  test("INV-010 มีรายการไม่พอ ไม่จองรายการใดเลย บอก เหลือ 2 ชิ้น และ สินค้าหมด และประวัติไม่มีบรรทัดใหม่", () => {
    const p = piti();
    const socks = addCartItem(db, { accountId: p.buyer.id, variantId: p.socks, quantity: 3 }).id;
    const bottle = addCartItem(db, { accountId: p.buyer.id, variantId: p.bottle, quantity: 1 }).id;
    addCartItem(db, { accountId: p.buyer.id, variantId: p.ball, quantity: 1 });

    expect(press(p.buyer.id, getCheckout(db, p.buyer.id))).toEqual({
      ok: false,
      problems: { [socks]: "เหลือ 2 ชิ้น", [bottle]: "สินค้าหมด" },
      addressProblem: null,
    });
    expect([stock(p.socks), stock(p.bottle), stock(p.ball)]).toEqual([2, 0, 8]);
    expect(count("stock_history")).toBe(0);
    expect(count("orders")).toBe(0);
  });
});

describe("INV-012 สต็อกไม่ต่ำกว่าศูนย์", () => {
  test("INV-012 สต็อก 1 สั่งซื้อ 1 สต็อกเป็น 0", () => {
    const buyer = addAccount(db);
    addAddress(db, { accountId: buyer.id, isDefault: true });
    const socks = addProduct(db, { stock: 1 }).variantIds[0];
    addCartItem(db, { accountId: buyer.id, variantId: socks });
    press(buyer.id, getCheckout(db, buyer.id), at("22:01:00"));

    expect(stock(socks)).toBe(0);
  });

  test("INV-012 สต็อก 0 สั่งซื้อได้ สินค้าหมด และฐานข้อมูลไม่รับสต็อก -5", () => {
    const buyer = addAccount(db);
    addAddress(db, { accountId: buyer.id, isDefault: true });
    const socks = addProduct(db, { stock: 0 }).variantIds[0];
    const item = addCartItem(db, { accountId: buyer.id, variantId: socks }).id;

    expect(press(buyer.id, getCheckout(db, buyer.id))).toMatchObject({ ok: false, problems: { [item]: "สินค้าหมด" } });
    expect(() => db.prepare("UPDATE variants SET stock = -5 WHERE id = ?").run(socks)).toThrow(/CHECK/);
    expect(stock(socks)).toBe(0);
  });
});

describe("CHK-Q01 ความเร็วของการกดสั่งซื้อ", () => {
  test("CHK-Q01 กดสั่งซื้อของ 3 ชิ้นจาก 2 ร้าน 100 ครั้ง กับสินค้า 1,000 รายการ เห็นผลภายใน 2 วินาที อย่างน้อย 95 ครั้ง", () => {
    const shops = Array.from({ length: 50 }, () => addShop(db).id);
    const variants = shops.flatMap((shopId) => Array.from({ length: 20 }, () => addProduct(db, { shopId, stock: 999 }).variantIds[0]));
    const buyer = addAccount(db);
    addAddress(db, { accountId: buyer.id, isDefault: true });

    const timings: number[] = [];
    for (let round = 0; round < 100; round++) {
      addCartItem(db, { accountId: buyer.id, variantId: variants[(round * 40) % 1000], quantity: 2 });
      addCartItem(db, { accountId: buyer.id, variantId: variants[(round * 40 + 20) % 1000] });
      const started = performance.now();
      const result = press(buyer.id, getCheckout(db, buyer.id));
      timings.push(performance.now() - started);
      expect(result).toMatchObject({ ok: true });
    }
    expect(timings.sort((a, b) => a - b)[94]).toBeLessThan(2000);
  });
});
