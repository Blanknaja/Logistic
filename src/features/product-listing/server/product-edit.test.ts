import { beforeEach, describe, expect, test } from "vitest";
import { getProductDetail } from "@/features/browse/server/product-detail";
import { confirmCheckout, getCart, type Cart } from "@/features/cart/server/cart";
import { placeOrder } from "@/features/checkout/server/checkout";
import { getShopOrder } from "@/features/shop-orders/server/orders";
import type { Db } from "@/shared/db";
import { addAccount, addAddress, addCartItem, addOrder, addProduct, addShop } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";
import { ORDER_STATUS, PRODUCT_STATUS } from "@/shared/statuses";
import { saveImageFile } from "./image-files";
import { MESSAGES, type ProductValues } from "./product-rules";
import {
  countShopProducts,
  createProduct,
  deleteProduct,
  getProductForEdit,
  listShopProducts,
  setProductHidden,
  updateProduct,
} from "./products";

let db: Db;
let shopId: number;
beforeEach(() => {
  db = createTestDb();
  shopId = addShop(db).id;
});

const at = (time: string) => new Date(`2026-11-25T${time}:00+07:00`);
const colorSize = [
  { name: "สี", values: ["แดง", "ดำ"] },
  { name: "ขนาด", values: ["M", "L"] },
];

/** "เสื้อยืดคอกลม" ขายอยู่ รูป 3 รูป แบบย่อย แดง M, แดง L, ดำ M, ดำ L ราคา 250 250 270 290 แก้ล่าสุด 10:15 */
function tshirt(status: (typeof PRODUCT_STATUS)[keyof typeof PRODUCT_STATUS] = PRODUCT_STATUS.onSale) {
  return addProduct(db, {
    shopId,
    status,
    name: "เสื้อยืดคอกลม",
    description: "ผ้าฝ้าย 100%",
    images: ["/sample-images/a.svg", "/sample-images/b.svg", "/sample-images/c.svg"],
    options: colorSize,
    variants: [{ price: 250 }, { price: 250 }, { price: 270 }, { price: 290 }],
    createdAt: at("10:15").toISOString(),
  });
}

function opened(productId: number) {
  const product = getProductForEdit(db, shopId, productId);
  if (!product) throw new Error("ไม่พบสินค้า");
  return product;
}

const priceOf = (values: ProductValues, label: string[]) => values.prices[JSON.stringify(label)];
const withPrice = (values: ProductValues, label: string[], price: string): ProductValues => ({
  ...values,
  prices: { ...values.prices, [JSON.stringify(label)]: price },
});
const statusOf = (productId: number) => db.prepare("SELECT status FROM products WHERE id = ?").get(productId)?.status;
const cartItem = (cart: Cart, variantId: number) => cart.shops.flatMap((shop) => shop.items).find((i) => i.variantId === variantId)!;

describe("PRD-006 เปิดหน้าฟอร์มเพื่อแก้ไขสินค้า", () => {
  test("PRD-006 ได้ข้อมูลล่าสุดครบทุกช่อง พร้อมสถานะและเวลาที่แก้ล่าสุด", () => {
    const product = tshirt();
    const opened = getProductForEdit(db, shopId, product.id);

    expect(opened).toEqual({
      id: product.id,
      status: PRODUCT_STATUS.onSale,
      updatedAt: at("10:15").toISOString(),
      values: {
        name: "เสื้อยืดคอกลม",
        description: "ผ้าฝ้าย 100%",
        categoryId: 1,
        images: ["/sample-images/a.svg", "/sample-images/b.svg", "/sample-images/c.svg"],
        options: colorSize,
        prices: { '["แดง","M"]': "250", '["แดง","L"]': "250", '["ดำ","M"]': "270", '["ดำ","L"]': "290" },
      },
    });
    // หน้าเว็บส่งข้อมูลนี้ให้ component ฝั่งเบราว์เซอร์ จึงต้องเป็น object ธรรมดา
    expect(Object.getPrototypeOf(opened)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(opened!.values.options[0])).toBe(Object.prototype);
  });

  test("PRD-006 ร่างที่ยังไม่ตั้งราคา ได้ช่องราคาว่าง", () => {
    const draft = addProduct(db, { shopId, status: PRODUCT_STATUS.draft, price: null, images: [] });
    expect(opened(draft.id).values).toMatchObject({ images: [], prices: { "[]": "" } });
  });

  test("PRD-006 สินค้าที่ถูกลบแล้ว หรือไม่มีอยู่ ได้ ไม่พบ", () => {
    const socks = addProduct(db, { shopId, status: PRODUCT_STATUS.deleted });
    expect(getProductForEdit(db, shopId, socks.id)).toBeNull();
    expect(getProductForEdit(db, shopId, 999)).toBeNull();
  });

  test("PRD-006 สินค้าของร้านอื่น ได้ ไม่พบ เหมือนสินค้าที่ไม่มีอยู่", () => {
    const other = addProduct(db, { shopId: addShop(db).id, status: PRODUCT_STATUS.draft });
    expect(getProductForEdit(db, shopId, other.id)).toBeNull();
  });
});

describe("PRD-007 บันทึกการแก้ไขสินค้า", () => {
  test("PRD-007 แก้ราคา ดำ L เป็น 310 คงสถานะเดิม ช่วงราคาและเวลาแก้ล่าสุดเปลี่ยน", () => {
    const product = tshirt();
    const form = opened(product.id);

    const result = updateProduct(db, shopId, product.id, form.updatedAt, withPrice(form.values, ["ดำ", "L"], "310"), "publish", at("13:10"));

    expect(result).toEqual({ ok: true, from: PRODUCT_STATUS.onSale, to: PRODUCT_STATUS.onSale });
    expect(listShopProducts(db, shopId, {}).items[0]).toMatchObject({
      status: PRODUCT_STATUS.onSale,
      minPrice: 250,
      maxPrice: 310,
      updatedAt: at("13:10").toISOString(),
    });
    // แบบย่อยเดิมถูกแก้ราคาในแถวเดิม สต็อกและตะกร้าจึงยังผูกกับแบบย่อยเดิม
    expect(db.prepare("SELECT price, stock, removed_at FROM variants WHERE id = ?").get(product.variantIds[3])).toEqual({
      price: 310,
      stock: 10,
      removed_at: null,
    });
  });

  test("PRD-007 สินค้าที่ ซ่อน แก้แล้วยังเป็น ซ่อน และรูปเดิมของสินค้าใช้ต่อได้", () => {
    const product = tshirt(PRODUCT_STATUS.hidden);
    const form = opened(product.id);
    const own = saveImageFile(db, shopId, new Uint8Array([0xff, 0xd8, 0xff, 0]));
    if (!own.ok) throw new Error(own.error);
    const images = [own.url, ...form.values.images.slice(1)];

    const result = updateProduct(db, shopId, product.id, form.updatedAt, { ...form.values, name: "เสื้อยืดคอกลม ผ้าหนา", images }, "publish", at("13:20"));

    expect(result).toEqual({ ok: true, from: PRODUCT_STATUS.hidden, to: PRODUCT_STATUS.hidden });
    expect(opened(product.id).values).toMatchObject({ name: "เสื้อยืดคอกลม ผ้าหนา", images });
  });

  test("PRD-007 ลบรูปออกทั้งหมด ไม่ถูกบันทึก รูปเดิมยังอยู่ และไม่กลับไปเป็น ร่าง", () => {
    const product = tshirt();
    const form = opened(product.id);

    const result = updateProduct(db, shopId, product.id, form.updatedAt, { ...form.values, images: [] }, "publish", at("13:15"));

    expect(result).toEqual({ ok: false, errors: { images: MESSAGES.imageRequired } });
    expect(opened(product.id)).toEqual(form);
    expect(getProductDetail(db, product.id)?.images).toHaveLength(3);
  });

  test("PRD-007 สินค้าที่ ขายอยู่ บันทึกเป็นร่างไม่ได้ ต้องตรวจข้อมูลครบเสมอ", () => {
    const product = tshirt();
    const form = opened(product.id);

    const result = updateProduct(db, shopId, product.id, form.updatedAt, { ...form.values, description: "" }, "draft", at("13:16"));

    expect(result).toEqual({ ok: false, errors: { description: MESSAGES.descriptionRequired } });
    expect(statusOf(product.id)).toBe(PRODUCT_STATUS.onSale);
  });

  test("PRD-007 ใช้รูปของร้านอื่นที่ไม่ใช่รูปเดิมของสินค้าไม่ได้", () => {
    const product = tshirt();
    const form = opened(product.id);
    const foreign = saveImageFile(db, addShop(db).id, new Uint8Array([0xff, 0xd8, 0xff, 0]));
    if (!foreign.ok) throw new Error(foreign.error);

    const result = updateProduct(db, shopId, product.id, form.updatedAt, { ...form.values, images: [foreign.url] }, "publish", at("13:17"));

    expect(result).toEqual({ ok: false, errors: { images: MESSAGES.imageNotFound } });
  });

  test("PRD-007 ร่างที่แก้แล้วกด บันทึกและเปิดขาย กลายเป็น ขายอยู่ พร้อมเวลาลงขาย", () => {
    const draft = addProduct(db, { shopId, status: PRODUCT_STATUS.draft, name: "หมวกแก๊ป", price: 120 });
    const form = opened(draft.id);

    expect(updateProduct(db, shopId, draft.id, form.updatedAt, form.values, "publish", at("15:00"))).toEqual({
      ok: true,
      from: PRODUCT_STATUS.draft,
      to: PRODUCT_STATUS.onSale,
    });
    expect(db.prepare("SELECT status, published_at FROM products WHERE id = ?").get(draft.id)).toEqual({
      status: PRODUCT_STATUS.onSale,
      published_at: at("15:00").toISOString(),
    });
  });
});

describe("PRD-008 ซ่อนและเลิกซ่อนสินค้า", () => {
  test("PRD-008 ซ่อนแล้วตัวกรองเปลี่ยน ผู้ซื้อไม่เห็น และเลิกซ่อนแล้วกลับมาด้วยข้อมูลเดิม", () => {
    const product = tshirt();
    const before = opened(product.id);

    expect(setProductHidden(db, shopId, product.id, true)).toBe(true);
    expect(countShopProducts(db, shopId)).toMatchObject({ [PRODUCT_STATUS.onSale]: 0, [PRODUCT_STATUS.hidden]: 1 });
    expect(getProductDetail(db, product.id)).toBeNull();

    expect(setProductHidden(db, shopId, product.id, false)).toBe(true);
    expect(opened(product.id)).toEqual(before);
    expect(getProductDetail(db, product.id)?.name).toBe("เสื้อยืดคอกลม");
  });

  test("PRD-008 ร่างซ่อนไม่ได้ และยังเป็น ร่าง", () => {
    const draft = addProduct(db, { shopId, status: PRODUCT_STATUS.draft });
    expect(setProductHidden(db, shopId, draft.id, true)).toBe(false);
    expect(setProductHidden(db, shopId, draft.id, false)).toBe(false);
    expect(statusOf(draft.id)).toBe(PRODUCT_STATUS.draft);
  });

  test("PRD-008 ซ่อนสินค้าของร้านอื่นไม่ได้", () => {
    const other = addProduct(db, { shopId: addShop(db).id });
    expect(setProductHidden(db, shopId, other.id, true)).toBe(false);
    expect(statusOf(other.id)).toBe(PRODUCT_STATUS.onSale);
  });
});

describe("PRD-009 ลบสินค้า", () => {
  test("PRD-009 ลบแล้วเป็น ลบแล้ว หายจากรายการของร้านและหน้าที่ผู้ซื้อใช้ และกู้กลับไม่ได้", () => {
    const socks = addProduct(db, { shopId, name: "ถุงเท้า" });
    addProduct(db, { shopId });

    expect(deleteProduct(db, shopId, socks.id, at("12:00"))).toBe(true);
    expect(statusOf(socks.id)).toBe(PRODUCT_STATUS.deleted);
    expect(countShopProducts(db, shopId).all).toBe(1);
    expect(listShopProducts(db, shopId, {}).items.map((item) => item.name)).not.toContain("ถุงเท้า");
    expect(getProductDetail(db, socks.id)).toBeNull();
    expect(setProductHidden(db, shopId, socks.id, false)).toBe(false);
    expect(getProductForEdit(db, shopId, socks.id)).toBeNull();
  });

  test("PRD-009 ลบสินค้าของร้านอื่นไม่ได้ สินค้ายังอยู่ด้วยสถานะเดิม", () => {
    const other = addProduct(db, { shopId: addShop(db).id, status: PRODUCT_STATUS.draft });
    expect(deleteProduct(db, shopId, other.id)).toBe(false);
    expect(statusOf(other.id)).toBe(PRODUCT_STATUS.draft);
  });
});

describe("PRD-010 สินค้าที่อยู่ในตะกร้าเมื่อถูกแก้ไข ซ่อน หรือลบ", () => {
  let buyer: number;
  beforeEach(() => {
    buyer = addAccount(db).id;
  });

  test("PRD-010 แก้ราคา ดำ L เป็น 310 ตะกร้าเห็นราคาใหม่ รวม 620 และรู้ว่าราคาเปลี่ยนจาก 290", () => {
    const product = tshirt();
    addCartItem(db, { accountId: buyer, variantId: product.variantIds[3], quantity: 2 });
    const form = opened(product.id);
    updateProduct(db, shopId, product.id, form.updatedAt, withPrice(form.values, ["ดำ", "L"], "310"), "publish", at("13:10"));

    expect(cartItem(getCart(db, buyer, at("13:20")), product.variantIds[3])).toMatchObject({
      price: 310,
      lineTotal: 620,
      priceChangedFrom: 290,
      unavailable: null,
    });
  });

  test("PRD-010 ซ่อนแล้วรายการในตะกร้าสั่งซื้อไม่ได้ เลิกซ่อนแล้วกลับมาสั่งซื้อได้ราคาเดิม", () => {
    const product = tshirt();
    addCartItem(db, { accountId: buyer, variantId: product.variantIds[0] });

    setProductHidden(db, shopId, product.id, true);
    const hidden = cartItem(getCart(db, buyer, at("14:10")), product.variantIds[0]);
    expect(hidden.unavailable).not.toBeNull();

    setProductHidden(db, shopId, product.id, false);
    expect(cartItem(getCart(db, buyer, at("14:35")), product.variantIds[0])).toMatchObject({
      quantity: 1,
      price: 250,
      unavailable: null,
    });
  });

  test("PRD-010 ลบสินค้าขณะผู้ซื้อเปิดตะกร้าค้าง กดสั่งซื้อจากหน้าเก่าไม่ผ่าน และรายการอื่นยังอยู่ครบ", () => {
    const socks = addProduct(db, { shopId, name: "ถุงเท้า", price: 59 });
    const cap = addProduct(db, { shopId, name: "หมวก", price: 120 });
    const socksItem = addCartItem(db, { accountId: buyer, variantId: socks.variantIds[0], quantity: 3 });
    const capItem = addCartItem(db, { accountId: buyer, variantId: cap.variantIds[0] });
    const shown = [
      { itemId: socksItem.id, price: 59, quantity: 3 },
      { itemId: capItem.id, price: 120, quantity: 1 },
    ];

    deleteProduct(db, shopId, socks.id, at("12:00"));

    expect(confirmCheckout(db, buyer, shown, at("12:00")).ok).toBe(false);
    const placed = placeOrder(
      db,
      {
        buyerAccountId: buyer,
        addressId: addAddress(db, { accountId: buyer, isDefault: true }).id,
        orderKey: "page-1",
        lines: shown.map(({ itemId, price, quantity }) => ({ cartItemId: itemId, unitPrice: price, quantity })),
      },
      at("12:00"),
    );
    expect(placed.ok).toBe(false);
    if (!placed.ok) expect(Object.keys(placed.problems)).toEqual([String(socksItem.id)]);
    expect(db.prepare("SELECT count(*) AS n FROM orders").get()?.n).toBe(0);
    const cart = getCart(db, buyer, at("12:00"));
    expect(cart.itemCount).toBe(2);
    expect(cartItem(cart, socks.variantIds[0]).unavailable).not.toBeNull();
    expect(cartItem(cart, cap.variantIds[0]).unavailable).toBeNull();
  });

  test("PRD-010 เอาค่า L ออกจากขนาด รายการ ดำ L ยังอยู่ในตะกร้าแต่สั่งซื้อไม่ได้ ไม่ถูกเปลี่ยนเป็นแบบย่อยอื่น", () => {
    const product = tshirt();
    addCartItem(db, { accountId: buyer, variantId: product.variantIds[3] });
    const form = opened(product.id);
    const options = [colorSize[0], { name: "ขนาด", values: ["M"] }];
    const prices = { '["แดง","M"]': "250", '["ดำ","M"]': "270" };

    expect(updateProduct(db, shopId, product.id, form.updatedAt, { ...form.values, options, prices }, "publish", at("15:00"))?.ok).toBe(true);

    const line = cartItem(getCart(db, buyer, at("15:10")), product.variantIds[3]);
    expect(line).toMatchObject({ variantId: product.variantIds[3], variantLabel: "ดำ L" });
    expect(line.unavailable).not.toBeNull();
    expect(opened(product.id).values).toMatchObject({ options, prices });
    // แบบย่อยที่ยังอยู่ใช้แถวเดิม สต็อกเดิมจึงไม่หาย
    expect(db.prepare("SELECT stock FROM variants WHERE id = ?").get(product.variantIds[2])).toEqual({ stock: 10 });
  });
});

describe("PRD-011 สินค้าที่อยู่ในคำสั่งซื้อเมื่อถูกแก้ไข ซ่อน หรือลบ", () => {
  let buyer: number;
  beforeEach(() => {
    buyer = addAccount(db).id;
  });

  test("PRD-011 แก้ราคาและชื่อหลังสั่งซื้อ คำสั่งซื้อยังเห็นชื่อ แบบย่อย และราคาเดิม", () => {
    const product = tshirt();
    const order = addOrder(db, { buyerAccountId: buyer, items: [{ variantId: product.variantIds[3], quantity: 2 }], status: ORDER_STATUS.paid });
    const form = opened(product.id);

    updateProduct(
      db,
      shopId,
      product.id,
      form.updatedAt,
      { ...withPrice(form.values, ["ดำ", "L"], "310"), name: "เสื้อยืดคอกลม ผ้าหนา" },
      "publish",
      at("13:10"),
    );

    expect(getShopOrder(db, shopId, order.orderNo)).toMatchObject({
      status: ORDER_STATUS.paid,
      itemsTotal: 580,
      items: [{ productName: "เสื้อยืดคอกลม", variantLabel: "ดำ L", unitPrice: 290, quantity: 2 }],
    });
  });

  test("PRD-011 ลบสินค้าระหว่างรอจ่ายเงิน คำสั่งซื้อยังเดินต่อได้ และสินค้าไม่กลับมาในรายการของร้าน", () => {
    const socks = addProduct(db, { shopId, name: "ถุงเท้า", price: 59, images: ["/sample-images/socks.svg"] });
    const order = addOrder(db, { buyerAccountId: buyer, items: [{ variantId: socks.variantIds[0], quantity: 3 }] });

    deleteProduct(db, shopId, socks.id, at("12:00"));
    // การจ่ายเงินเป็นของ PAY ในที่นี้เปลี่ยนสถานะตรงๆ แทน
    db.prepare("UPDATE orders SET status = ?, paid_at = ? WHERE id = ?").run(ORDER_STATUS.paid, at("12:10").toISOString(), order.id);

    expect(getShopOrder(db, shopId, order.orderNo)).toMatchObject({
      status: ORDER_STATUS.paid,
      itemsTotal: 177,
      items: [{ productName: "ถุงเท้า", unitPrice: 59, quantity: 3, coverImageUrl: "/sample-images/socks.svg" }],
    });
    expect(countShopProducts(db, shopId).all).toBe(0);
  });
});

describe("PRD-013 กดซ้ำ และแก้พร้อมกันจากสองหน้าต่าง", () => {
  test("PRD-013 บันทึกจากหน้าต่างเดียว ราคา แดง M เป็น 260", () => {
    const product = tshirt();
    const form = opened(product.id);

    expect(updateProduct(db, shopId, product.id, form.updatedAt, withPrice(form.values, ["แดง", "M"], "260"), "publish", at("17:01"))?.ok).toBe(true);
    expect(priceOf(opened(product.id).values, ["แดง", "M"])).toBe("260");
  });

  test("PRD-013 กด บันทึกและเปิดขาย สองครั้งด้วยหน้าฟอร์มเดียวกัน ได้สินค้าชิ้นเดียว", () => {
    const values: ProductValues = {
      name: "ผ้าพันคอ",
      description: "ผ้าไหม",
      categoryId: 1,
      images: [],
      options: [],
      prices: { "[]": "199" },
    };
    const image = saveImageFile(db, shopId, new Uint8Array([0xff, 0xd8, 0xff, 0]));
    if (!image.ok) throw new Error(image.error);
    values.images = [image.url];

    const first = createProduct(db, shopId, values, "publish", at("17:05"), "form-1");
    const second = createProduct(db, shopId, values, "publish", at("17:05"), "form-1");

    expect(second).toEqual(first);
    expect(countShopProducts(db, shopId).all).toBe(1);
    // หน้าฟอร์มอื่นของร้านอื่นที่บังเอิญได้รหัสเดียวกันไม่ชนกัน
    const otherShop = addShop(db).id;
    expect(createProduct(db, otherShop, { ...values, images: [] }, "draft", at("17:06"), "form-1").ok).toBe(true);
  });

  test("PRD-013 บันทึกจากหน้าต่างที่สองที่เปิดไว้ก่อน ถูกปฏิเสธพร้อมเวลาที่แก้ล่าสุด และไม่เขียนทับ", () => {
    const product = tshirt();
    const first = opened(product.id);
    const second = opened(product.id);

    updateProduct(db, shopId, product.id, first.updatedAt, withPrice(first.values, ["แดง", "M"], "270"), "publish", at("17:12"));
    const result = updateProduct(db, shopId, product.id, second.updatedAt, { ...second.values, name: "ชื่อใหม่" }, "publish", at("17:14"));

    expect(result).toEqual({ ok: false, changedAt: at("17:12").toISOString() });
    expect(opened(product.id).values).toMatchObject({ name: "เสื้อยืดคอกลม" });
    expect(priceOf(opened(product.id).values, ["แดง", "M"])).toBe("270");
  });

  test("PRD-013 บันทึกสินค้าที่ถูกลบหรือเป็นของร้านอื่น ได้ ไม่พบ และไม่มีอะไรเปลี่ยน", () => {
    const product = tshirt();
    const form = opened(product.id);
    deleteProduct(db, shopId, product.id);

    expect(updateProduct(db, shopId, product.id, form.updatedAt, form.values, "publish")).toBeNull();
    expect(updateProduct(db, addShop(db).id, product.id, form.updatedAt, form.values, "publish")).toBeNull();
    expect(statusOf(product.id)).toBe(PRODUCT_STATUS.deleted);
  });
});
