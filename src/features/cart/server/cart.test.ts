import { beforeEach, describe, expect, test } from "vitest";
import {
  addToCart,
  changeQuantity,
  confirmCheckout,
  countCartItems,
  getCart,
  listSelectedCartItems,
  removeCartItem,
  setCartSelection,
  variantProductId,
  type Cart,
  type CartItem,
} from "@/features/cart/server/cart";
import type { Db } from "@/shared/db";
import { addAccount, addCartItem, addProduct, addShop } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";
import { PRODUCT_STATUS, SHOP_STATUS } from "@/shared/statuses";

let db: Db;
let buyer: number;

beforeEach(() => {
  db = createTestDb();
  buyer = addAccount(db).id;
});

const at = (hhmm: string) => new Date(`2026-11-25T${hhmm}:00+07:00`);
const items = (cart: Cart): CartItem[] => cart.shops.flatMap((shop) => shop.items);
const item = (cart: Cart, variantId: number) => items(cart).find((line) => line.variantId === variantId)!;
const add = (variantId: number, quantity: string | number, when = at("09:00"), accountId = buyer) =>
  addToCart(db, accountId, { variantId, quantity: String(quantity) }, when);
const setPrice = (variantId: number, price: number) => db.prepare("UPDATE variants SET price = ? WHERE id = ?").run(price, variantId);
const setStock = (variantId: number, stock: number) => db.prepare("UPDATE variants SET stock = ? WHERE id = ?").run(stock, variantId);

function tShirt(stock = 10) {
  const shopId = addShop(db, { name: "บ้านผ้า" }).id;
  return addProduct(db, {
    shopId,
    name: "เสื้อยืดคอกลม",
    price: 250,
    stock,
    options: [
      { name: "สี", values: ["ดำ", "ขาว"] },
      { name: "ขนาด", values: ["L"] },
    ],
  });
}

describe("CRT-001 เพิ่มสินค้าลงตะกร้า", () => {
  test("CRT-001 เลือกแบบย่อยและจำนวนครบ ได้รายการใหม่ที่เลือกไว้ และไอคอนนับเพิ่ม", () => {
    const other = addProduct(db, { price: 90, stock: 5 });
    add(other.variantIds[0], 1);
    add(addProduct(db, { price: 90, stock: 5 }).variantIds[0], 1);
    const shirt = tShirt();
    const [blackL] = shirt.variantIds;

    expect(add(blackL, 2, at("14:05"))).toEqual({ ok: true, message: "ใส่ตะกร้าแล้ว" });
    expect(countCartItems(db, buyer)).toBe(3);
    expect(item(getCart(db, buyer), blackL)).toMatchObject({ quantity: 2, selected: true, price: 250, variantLabel: "ดำ L" });
  });

  test("CRT-001 จำนวนเป็น 0 เว้นว่าง หรือไม่ใช่เลขเต็ม ไม่เพิ่มอะไร", () => {
    const [blackL] = tShirt().variantIds;
    for (const quantity of ["0", "", " ", "-1", "1.5", "abc"]) {
      expect(add(blackL, quantity)).toEqual({ ok: false, message: "จำนวนต้องเป็น 1 ขึ้นไป" });
    }
    expect(countCartItems(db, buyer)).toBe(0);
  });
});

describe("CRT-002 เพิ่มสินค้าที่มีอยู่ในตะกร้าแล้ว", () => {
  test("CRT-002 แบบย่อยเดิมบวกจำนวนเข้ารายการเดิม แบบย่อยอื่นเป็นรายการใหม่", () => {
    const [blackL, whiteL] = tShirt().variantIds;
    add(blackL, 2);

    expect(add(blackL, 3).ok).toBe(true);
    expect(countCartItems(db, buyer)).toBe(1);
    expect(item(getCart(db, buyer), blackL).quantity).toBe(5);

    add(whiteL, 1);
    expect(countCartItems(db, buyer)).toBe(2);
  });

  test("CRT-002 รวมแล้วเกินสต็อก ปฏิเสธทั้งครั้งและบอกว่าเพิ่มได้อีกเท่าไร", () => {
    const [blackL] = tShirt(10).variantIds;
    add(blackL, 8);

    expect(add(blackL, 5)).toEqual({ ok: false, message: "เพิ่มได้อีกไม่เกิน 2 ชิ้น เพราะในตะกร้ามีอยู่แล้ว 8 ชิ้น" });
    expect(item(getCart(db, buyer), blackL).quantity).toBe(8);
  });
});

describe("CRT-004 ผู้ขายเพิ่มสินค้าของร้านตัวเองไม่ได้", () => {
  test("CRT-004 ผู้ขายเพิ่มสินค้าของร้านอื่นได้ตามปกติ", () => {
    const wichai = addAccount(db).id;
    addShop(db, { ownerAccountId: wichai, name: "บ้านผ้า" });
    const pillow = addProduct(db, { name: "หมอนอิง", price: 180 });

    expect(add(pillow.variantIds[0], 1, at("11:00"), wichai).ok).toBe(true);
    expect(countCartItems(db, wichai)).toBe(1);
  });

  test("CRT-004 คำขอเพิ่มสินค้าของร้านตัวเองถูกปฏิเสธ แม้มาจากหน้าที่เปิดค้างไว้", () => {
    const wichai = addAccount(db).id;
    add(addProduct(db).variantIds[0], 1, at("10:00"), wichai);
    const ownShop = addShop(db, { ownerAccountId: wichai }).id;
    const own = addProduct(db, { shopId: ownShop });

    expect(add(own.variantIds[0], 1, at("11:05"), wichai)).toEqual({ ok: false, message: "ซื้อสินค้าจากร้านตัวเองไม่ได้" });
    expect(countCartItems(db, wichai)).toBe(1);
  });
});

describe("CRT-005 จำนวนไม่เกินสต็อก", () => {
  test("CRT-005 ใส่เท่าสต็อกได้", () => {
    const shoe = addProduct(db, { name: "รองเท้าผ้าใบ", stock: 3 });
    expect(add(shoe.variantIds[0], 3).ok).toBe(true);
    expect(item(getCart(db, buyer), shoe.variantIds[0]).quantity).toBe(3);
  });

  test("CRT-005 ใส่หรือพิมพ์จำนวนเกินสต็อก ไม่รับและบอกจำนวนสูงสุด", () => {
    const shoe = addProduct(db, { name: "รองเท้าผ้าใบ", stock: 3 });
    const [variant] = shoe.variantIds;
    expect(add(variant, 4)).toEqual({ ok: false, message: "ใส่ได้ไม่เกิน 3 ชิ้น" });

    add(variant, 3);
    const line = item(getCart(db, buyer), variant);
    expect(changeQuantity(db, buyer, line.id, "5")).toEqual({ ok: false, message: "ใส่ได้ไม่เกิน 3 ชิ้น" });
    expect(item(getCart(db, buyer), variant).quantity).toBe(3);
    expect(getCart(db, buyer).total).toBe(300);
  });

  test("CRT-005 สินค้าหมดใส่ตะกร้าไม่ได้", () => {
    const soldOut = addProduct(db, { stock: 0 });
    expect(add(soldOut.variantIds[0], 1)).toEqual({ ok: false, message: "สินค้าหมด" });
  });
});

describe("CRT-006 ดูตะกร้าแยกตามร้าน", () => {
  test("CRT-006 จัดกลุ่มตามร้าน ร้านที่เพิ่มล่าสุดอยู่บน พร้อมราคารวมของแต่ละรายการ", () => {
    const banPha = addShop(db, { name: "บ้านผ้า" }).id;
    const dinPao = addShop(db, { name: "ดินเผา" }).id;
    const shirt = addProduct(db, { shopId: banPha, name: "เสื้อยืดคอกลม", price: 250, images: ["/sample-images/shirt.svg"] });
    const shorts = addProduct(db, { shopId: banPha, name: "กางเกงขาสั้น", price: 300 });
    const cup = addProduct(db, { shopId: dinPao, name: "แก้วเซรามิก", price: 120 });
    add(shirt.variantIds[0], 2, at("14:05"));
    add(shorts.variantIds[0], 1, at("14:06"));
    add(cup.variantIds[0], 1, at("14:20"));

    const cart = getCart(db, buyer, at("14:30"));

    expect(cart.shops.map((shop) => [shop.name, shop.total])).toEqual([
      ["ดินเผา", 120],
      ["บ้านผ้า", 800],
    ]);
    expect(cart.shops[1].id).toBe(banPha);
    expect(cart.shops[1].items.map((line) => [line.name, line.price, line.quantity, line.lineTotal])).toEqual([
      ["กางเกงขาสั้น", 300, 1, 300],
      ["เสื้อยืดคอกลม", 250, 2, 500],
    ]);
    expect(item(cart, shirt.variantIds[0]).imageUrl).toBe("/sample-images/shirt.svg");
  });

  test("CRT-006 เห็นเฉพาะตะกร้าของตัวเอง แก้รายการของคนอื่นไม่ได้", () => {
    const somying = addAccount(db).id;
    const products = Array.from({ length: 5 }, () => addProduct(db));
    for (const product of products) add(product.variantIds[0], 1, at("09:00"), somying);
    for (const product of products.slice(0, 3)) add(product.variantIds[0], 1);

    expect(items(getCart(db, buyer))).toHaveLength(3);
    const hers = items(getCart(db, somying))[0];
    changeQuantity(db, buyer, hers.id, "2");
    removeCartItem(db, buyer, hers.id);
    setCartSelection(db, buyer, [hers.id], false);
    expect(item(getCart(db, somying), hers.variantId)).toMatchObject({ quantity: 1, selected: true });
  });
});

describe("CRT-009 บันทึกไม่สำเร็จ", () => {
  test("CRT-009 ลองใหม่หลังเน็ตกลับมา จำนวนและยอดรวมเปลี่ยนตาม", () => {
    const [variant] = tShirt().variantIds;
    add(variant, 2);
    const line = item(getCart(db, buyer), variant);

    expect(changeQuantity(db, buyer, line.id, "3").ok).toBe(true);
    expect(getCart(db, buyer).total).toBe(750);
  });

  test("CRT-009 คำขอที่ไม่ถึงเซิร์ฟเวอร์ไม่เปลี่ยนอะไร เปิดใหม่ยังเห็นจำนวนเดิม", () => {
    const [variant] = tShirt().variantIds;
    add(variant, 2);
    expect(item(getCart(db, buyer, at("21:30")), variant).quantity).toBe(2);
  });
});

describe("CRT-010 เปลี่ยนจำนวน", () => {
  test("CRT-010 กดบวก ราคารวมของรายการ ยอดร้าน และยอดรวมเพิ่มตาม", () => {
    const [variant] = tShirt().variantIds;
    add(variant, 2);
    const line = item(getCart(db, buyer), variant);

    expect(changeQuantity(db, buyer, line.id, "3")).toEqual({ ok: true, message: null });
    const cart = getCart(db, buyer);
    expect(item(cart, variant).lineTotal).toBe(750);
    expect(cart.shops[0].total).toBe(750);
    expect(cart.total).toBe(750);
  });

  test("CRT-010 สองเครื่องแก้พร้อมกันใช้ครั้งหลังสุด และจำนวนต่ำกว่า 1 ไม่ได้", () => {
    const [variant] = tShirt().variantIds;
    add(variant, 3);
    const line = item(getCart(db, buyer), variant);

    changeQuantity(db, buyer, line.id, "5");
    changeQuantity(db, buyer, line.id, "1");
    expect(item(getCart(db, buyer), variant).quantity).toBe(1);
    expect(changeQuantity(db, buyer, line.id, "0")).toEqual({ ok: false, message: "จำนวนต้องเป็น 1 ขึ้นไป" });
    expect(item(getCart(db, buyer), variant).quantity).toBe(1);
  });
});

describe("CRT-011 ลบรายการ", () => {
  test("CRT-011 ลบรายการเดียวของร้าน กลุ่มร้านหาย ไอคอนและยอดรวมลดลง", () => {
    const shirt = tShirt();
    add(shirt.variantIds[0], 2, at("14:05"));
    add(addProduct(db, { shopId: shirt.shopId, price: 300 }).variantIds[0], 1, at("14:06"));
    const cup = addProduct(db, { name: "แก้วเซรามิก", price: 120 });
    add(cup.variantIds[0], 1, at("14:20"));
    expect(getCart(db, buyer).total).toBe(920);

    removeCartItem(db, buyer, item(getCart(db, buyer), cup.variantIds[0]).id);

    const cart = getCart(db, buyer);
    expect(cart.shops).toHaveLength(1);
    expect(countCartItems(db, buyer)).toBe(2);
    expect(cart.total).toBe(800);
  });

  test("CRT-011 ลบรายการที่ถูกลบไปแล้วจากอีกเครื่อง ไม่มีข้อผิดพลาด", () => {
    const [variant] = tShirt().variantIds;
    add(variant, 1);
    const line = item(getCart(db, buyer), variant);
    removeCartItem(db, buyer, line.id);

    expect(() => removeCartItem(db, buyer, line.id)).not.toThrow();
    expect(countCartItems(db, buyer)).toBe(0);
  });
});

describe("CRT-012 เลือกรายการและดูยอดรวม", () => {
  function somchaiCart() {
    const banPha = addShop(db).id;
    const shirt = addProduct(db, { shopId: banPha, price: 250 }).variantIds[0];
    const shorts = addProduct(db, { shopId: banPha, price: 300 }).variantIds[0];
    const cup = addProduct(db, { price: 120 }).variantIds[0];
    add(shirt, 2, at("14:05"));
    add(shorts, 1, at("14:06"));
    add(cup, 1, at("14:20"));
    return { shirt, shorts, cup };
  }

  test("CRT-012 เลิกเลือกรายการ ยอดรวมคิดเฉพาะที่เลือก และจำไว้กับบัญชี", () => {
    const { shirt, shorts } = somchaiCart();
    setCartSelection(db, buyer, [item(getCart(db, buyer), shorts).id], false);

    const cart = getCart(db, buyer, at("19:00"));
    expect(cart.shops.map((shop) => shop.total)).toEqual([120, 500]);
    expect(cart.total).toBe(620);
    expect(cart.pieces).toBe(3);
    expect(item(cart, shorts).selected).toBe(false);
    expect(item(cart, shirt).selected).toBe(true);
  });

  test("CRT-012 เลือกทั้งหมดไม่เลือกรายการที่ซื้อไม่ได้ เลิกเลือกทั้งหมดได้ยอด 0", () => {
    somchaiCart();
    const pillow = addProduct(db, { price: 180, stock: 1 }).variantIds[0];
    add(pillow, 1, at("15:00"));
    setStock(pillow, 0);
    const all = items(getCart(db, buyer)).map((line) => line.id);

    setCartSelection(db, buyer, all, true);
    let cart = getCart(db, buyer);
    expect(item(cart, pillow).selected).toBe(false);
    expect(cart.total).toBe(920);

    setCartSelection(db, buyer, all, false);
    cart = getCart(db, buyer);
    expect(cart.total).toBe(0);
    expect(cart.pieces).toBe(0);
  });
});

describe("CRT-013 แจ้งเมื่อราคาเปลี่ยน", () => {
  test("CRT-013 ร้านขึ้นราคา รายการแสดงราคาใหม่ บอกราคาเดิม และยอดรวมใช้ราคาใหม่", () => {
    const [variant] = tShirt().variantIds;
    add(variant, 1, at("09:30"));
    setPrice(variant, 300);

    const cart = getCart(db, buyer, at("10:15"));
    expect(item(cart, variant)).toMatchObject({ price: 300, priceChangedFrom: 250 });
    expect(cart.total).toBe(300);

    const line = item(cart, variant);
    expect(confirmCheckout(db, buyer, [{ itemId: line.id, price: 300, quantity: 1 }])).toEqual({ ok: true });
    expect(item(getCart(db, buyer), variant).priceChangedFrom).toBeNull();
  });

  test("CRT-013 ราคากลับมาเท่าเดิม ไม่มีข้อความแจ้ง", () => {
    const [variant] = tShirt().variantIds;
    add(variant, 1, at("09:30"));
    setPrice(variant, 300);
    setPrice(variant, 250);

    expect(item(getCart(db, buyer, at("10:15")), variant)).toMatchObject({ price: 250, priceChangedFrom: null });
  });
});

describe("CRT-014 รายการที่ซื้อไม่ได้", () => {
  test("CRT-014 สินค้าหมด ซ่อน ลบ หรือร้านถูกระงับ เป็นรายการที่ซื้อไม่ได้พร้อมเหตุผล", () => {
    const shoe = addProduct(db, { name: "รองเท้าผ้าใบ", stock: 5 });
    const pillow = addProduct(db, { name: "หมอนอิง" });
    const cup = addProduct(db, { name: "แก้วเซรามิก", images: ["/sample-images/cup.svg"] });
    const toyShop = addShop(db, { name: "ของเล่นไม้" }).id;
    const train = addProduct(db, { shopId: toyShop, name: "รถไม้" });
    const removedVariant = addProduct(db, { options: [{ name: "สี", values: ["แดง", "ฟ้า"] }] });
    add(shoe.variantIds[0], 1, at("16:00"));
    add(pillow.variantIds[0], 1, at("16:01"));
    add(cup.variantIds[0], 1, at("16:02"));
    add(train.variantIds[0], 1, at("16:03"));
    add(removedVariant.variantIds[1], 1, at("16:04"));

    setStock(shoe.variantIds[0], 0);
    db.prepare("UPDATE products SET status = ? WHERE id = ?").run(PRODUCT_STATUS.hidden, pillow.id);
    db.prepare("UPDATE products SET status = ? WHERE id = ?").run(PRODUCT_STATUS.deleted, cup.id);
    db.prepare("UPDATE shops SET status = ? WHERE id = ?").run(SHOP_STATUS.suspended, toyShop);
    db.prepare("UPDATE variants SET removed_at = ? WHERE id = ?").run(at("16:30").toISOString(), removedVariant.variantIds[1]);

    const cart = getCart(db, buyer, at("17:10"));
    expect(
      [shoe, pillow, cup, train].map((product) => item(cart, product.variantIds[0]).unavailable),
    ).toEqual(["สินค้าหมด", "สินค้านี้ไม่เปิดขายแล้ว", "สินค้านี้ไม่เปิดขายแล้ว", "ร้านนี้ไม่เปิดขายตอนนี้"]);
    expect(item(cart, removedVariant.variantIds[1]).unavailable).toBe("สินค้านี้ไม่เปิดขายแล้ว");
    expect(item(cart, cup.variantIds[0])).toMatchObject({ name: "แก้วเซรามิก", imageUrl: "/sample-images/cup.svg" });
    expect(items(cart).every((line) => !line.selected)).toBe(true);
    expect(cart.total).toBe(0);

    const shoeLine = item(cart, shoe.variantIds[0]);
    expect(changeQuantity(db, buyer, shoeLine.id, "1")).toEqual({ ok: false, message: "สินค้าหมด" });
    setCartSelection(db, buyer, [shoeLine.id], true);
    expect(item(getCart(db, buyer), shoe.variantIds[0]).selected).toBe(false);

    setStock(shoe.variantIds[0], 5);
    expect(item(getCart(db, buyer, at("18:00")), shoe.variantIds[0])).toMatchObject({ unavailable: null, selected: false });
  });

  test("CRT-014 สต็อกลดต่ำกว่าจำนวนในตะกร้า ปรับจำนวนลงพร้อมข้อความ และยังเลือกอยู่", () => {
    const shoe = addProduct(db, { name: "รองเท้าผ้าใบ", price: 1000, stock: 3 });
    const [variant] = shoe.variantIds;
    add(variant, 3, at("17:00"));
    setStock(variant, 2);

    const cart = getCart(db, buyer, at("17:35"));
    expect(item(cart, variant)).toMatchObject({
      quantity: 2,
      selected: true,
      notice: "ปรับจำนวนเหลือ 2 ชิ้น เพราะสินค้าเหลือ 2 ชิ้น",
    });
    expect(cart.total).toBe(2000);
    expect(item(getCart(db, buyer), variant)).toMatchObject({ quantity: 2, notice: null });
  });
});

describe("CRT-015 ไปหน้าสั่งซื้อ", () => {
  function shown(cart: Cart) {
    return items(cart)
      .filter((line) => line.selected)
      .map((line) => ({ itemId: line.id, price: line.price, quantity: line.quantity }));
  }

  test("CRT-015 ทุกอย่างตรงกับหน้าจอ ไปหน้าสั่งซื้อได้ ตะกร้ายังครบและการเลือกเหมือนเดิม", () => {
    const shirt = tShirt().variantIds[0];
    const shorts = addProduct(db, { price: 300 }).variantIds[0];
    const cup = addProduct(db, { price: 120 }).variantIds[0];
    add(shirt, 2, at("15:00"));
    add(shorts, 1, at("15:01"));
    add(cup, 1, at("15:02"));
    setCartSelection(db, buyer, [item(getCart(db, buyer), shorts).id], false);

    const before = getCart(db, buyer, at("15:40"));
    expect(before.total).toBe(620);
    expect(confirmCheckout(db, buyer, shown(before), at("15:40"))).toEqual({ ok: true });
    expect(listSelectedCartItems(db, buyer).map((line) => [line.variantId, line.quantity, line.price])).toEqual([
      [cup, 1, 120],
      [shirt, 2, 250],
    ]);
    expect(getCart(db, buyer, at("15:42"))).toEqual(before);
  });

  test("CRT-015 ราคาหรือสต็อกเปลี่ยนหลังเปิดหน้า ไม่ไปต่อ และตะกร้าแสดงค่าล่าสุด", () => {
    const shirt = tShirt().variantIds[0];
    const cup = addProduct(db, { price: 120, stock: 1 }).variantIds[0];
    add(shirt, 2, at("15:00"));
    add(cup, 1, at("15:01"));
    const onScreen = shown(getCart(db, buyer, at("15:40")));
    setPrice(shirt, 300);
    setStock(cup, 0);

    expect(confirmCheckout(db, buyer, onScreen, at("15:55"))).toEqual({
      ok: false,
      message: "มีรายการเปลี่ยนแปลง กรุณาตรวจอีกครั้ง",
    });
    const cart = getCart(db, buyer, at("15:55"));
    expect(item(cart, shirt)).toMatchObject({ price: 300, priceChangedFrom: 250 });
    expect(item(cart, cup)).toMatchObject({ unavailable: "สินค้าหมด", selected: false });
    expect(cart.total).toBe(600);

    expect(confirmCheckout(db, buyer, shown(cart), at("15:56"))).toEqual({ ok: true });
  });

  test("CRT-015 ไม่ได้เลือกรายการใดไปหน้าสั่งซื้อไม่ได้", () => {
    const [variant] = tShirt().variantIds;
    add(variant, 1);
    setCartSelection(db, buyer, [item(getCart(db, buyer), variant).id], false);

    expect(confirmCheckout(db, buyer, [])).toEqual({ ok: false, message: "ยังไม่ได้เลือกสินค้า" });
  });
});

describe("CRT-003 คนที่ยังไม่เข้าสู่ระบบ", () => {
  test("CRT-003 หาสินค้าของแบบย่อยได้ เพื่อพากลับมาหน้าสินค้าเดิมหลังเข้าสู่ระบบ", () => {
    const cup = addProduct(db, { name: "แก้วเซรามิก" });
    expect(variantProductId(db, cup.variantIds[0])).toBe(cup.id);
  });

  test("CRT-003 แบบย่อยที่ไม่มีอยู่ ไม่มีสินค้าให้กลับไป", () => {
    expect(variantProductId(db, 999_999)).toBeNull();
  });
});

describe("CRT-Q01 ความเร็วแสดงหน้าตะกร้า", () => {
  function fiftyItems(accountId: number) {
    for (let shop = 0; shop < 10; shop++) {
      const shopId = addShop(db).id;
      for (let n = 0; n < 5; n++) {
        addCartItem(db, { accountId, variantId: addProduct(db, { shopId, price: 100 + n }).variantIds[0] });
      }
    }
  }

  test("CRT-Q01 ตะกร้า 50 รายการจาก 10 ร้าน อ่านครบ 100 ครั้งเร็วกว่า 2 วินาทีต่อครั้งมาก", () => {
    fiftyItems(buyer);
    const started = performance.now();
    for (let n = 0; n < 100; n++) getCart(db, buyer);
    const cart = getCart(db, buyer);

    expect(cart.shops).toHaveLength(10);
    expect(items(cart)).toHaveLength(50);
    expect((performance.now() - started) / 100).toBeLessThan(200);
  });

  test("CRT-Q01 ตะกร้าใหญ่ยังนับยอดรวมครบ ไม่ตกรายการใด", () => {
    fiftyItems(buyer);
    expect(getCart(db, buyer).total).toBe(10 * (100 + 101 + 102 + 103 + 104));
  });
});

describe("CRT-Q02 ความเร็วอัปเดตยอดรวม", () => {
  test("CRT-Q02 กดบวก 100 ครั้งในตะกร้า 50 รายการ ยอดรวมตรงกับราคาคูณจำนวนทุกครั้ง", () => {
    const variants = Array.from({ length: 50 }, (_, n) => addProduct(db, { price: 10 + n, stock: 1000 }).variantIds[0]);
    for (const variant of variants) add(variant, 1);
    const started = performance.now();

    for (let n = 0; n < 100; n++) {
      const line = items(getCart(db, buyer))[n % 50];
      changeQuantity(db, buyer, line.id, String(line.quantity + 1));
      const cart = getCart(db, buyer);
      expect(cart.total).toBe(items(cart).reduce((sum, l) => sum + l.price * l.quantity, 0));
    }
    expect((performance.now() - started) / 100).toBeLessThan(100);
  });

  test("CRT-Q02 ค่าที่ส่งมาผิดรูปแบบ ไม่เปลี่ยนยอดรวม", () => {
    const [variant] = tShirt().variantIds;
    add(variant, 2);
    const line = item(getCart(db, buyer), variant);
    expect(changeQuantity(db, buyer, line.id, "2abc").ok).toBe(false);
    expect(getCart(db, buyer).total).toBe(500);
  });
});
