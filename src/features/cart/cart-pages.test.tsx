// test ระดับหน้าและ server action ของตะกร้า ส่วน vi.mock ลอกมาจาก src/features/account/account-pages.test.tsx

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import CartError from "@/app/cart/error";
import CartLoadingPage from "@/app/cart/loading";
import CartPage from "@/app/cart/page";
import { createSession } from "@/features/account/server/sessions";
import {
  addToCartAction,
  changeQuantityAction,
  checkoutAction,
  removeItemAction,
  selectItemsAction,
} from "@/features/cart/actions";
import { CartLine, CartSummary, ConfirmRemove } from "@/features/cart/components/cart-view";
import { settle } from "@/features/cart/components/settle";
import { getCart, type Cart } from "@/features/cart/server/cart";
import type { Db } from "@/shared/db";
import { addAccount, addCartItem, addProduct, addShop } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";
import { SiteHeader } from "@/shared/layout/site-header";
import { SESSION_COOKIE } from "@/shared/session";

const request = vi.hoisted(() => ({
  db: undefined as Db | undefined,
  cookies: new Map<string, string>(),
  Redirected: class Redirected extends Error {
    constructor(readonly url: string) {
      super(`redirect ${url}`);
    }
  },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (request.cookies.has(name) ? { name, value: request.cookies.get(name) } : undefined),
    set: (name: string, value: string) => void request.cookies.set(name, value),
    delete: (name: string) => void request.cookies.delete(name),
  }),
  headers: async () => new Headers(),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: (url: string) => {
    throw new request.Redirected(url);
  },
  notFound: () => {
    throw new request.Redirected("not-found");
  },
  useRouter: () => ({ refresh: () => {} }),
}));

vi.mock("next/cache", () => ({ refresh: () => {}, revalidatePath: () => {} }));

vi.mock("@/shared/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/db")>()),
  getDb: () => request.db,
}));

let db: Db;

beforeEach(() => {
  db = createTestDb();
  request.db = db;
  request.cookies.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

async function attempt<T>(work: Promise<T>): Promise<{ redirect?: string; value?: T }> {
  try {
    return { value: await work };
  } catch (error) {
    if (error instanceof request.Redirected) return { redirect: error.url };
    throw error;
  }
}

const page = async () => {
  const result = await attempt(CartPage());
  return { redirect: result.redirect, html: result.value === undefined ? "" : renderToStaticMarkup(result.value) };
};
const header = async () => renderToStaticMarkup(await SiteHeader());
const allCartRows = () => Number(db.prepare("SELECT count(*) AS n FROM cart_items").get()?.n);

function signIn(): number {
  const accountId = addAccount(db).id;
  request.cookies.set(SESSION_COOKIE, createSession(db, accountId));
  return accountId;
}

const items = (cart: Cart) => cart.shops.flatMap((shop) => shop.items);
const noop = () => {};

describe("CRT-001 เพิ่มสินค้าลงตะกร้าจากหน้ารายละเอียดสินค้า", () => {
  test("CRT-001 ได้ข้อความใส่ตะกร้าแล้ว และไอคอนตะกร้าที่แถบด้านบนแสดงจำนวนรายการ", async () => {
    const buyer = signIn();
    addCartItem(db, { accountId: buyer, variantId: addProduct(db).variantIds[0] });
    addCartItem(db, { accountId: buyer, variantId: addProduct(db).variantIds[0] });
    const shirt = addProduct(db, { price: 250, stock: 10 });

    const result = await attempt(addToCartAction({ variantId: shirt.variantIds[0], quantity: "2" }));

    expect(result.value).toEqual({ ok: true, message: "ใส่ตะกร้าแล้ว" });
    expect(await header()).toContain(">ตะกร้า (3)</a>");
  });

  test("CRT-001 จำนวนเว้นว่าง ไม่เพิ่มสินค้าและไอคอนเท่าเดิม", async () => {
    signIn();
    const shirt = addProduct(db);
    const result = await attempt(addToCartAction({ variantId: shirt.variantIds[0], quantity: "" }));

    expect(result.value).toEqual({ ok: false, message: "จำนวนต้องเป็น 1 ขึ้นไป" });
    expect(await header()).toContain(">ตะกร้า</a>");
  });
});

describe("CRT-003 คนที่ยังไม่เข้าสู่ระบบ", () => {
  test("CRT-003 กดใส่ตะกร้าถูกพาไปหน้าเข้าสู่ระบบที่พากลับหน้าสินค้าเดิม และไม่มีสินค้าถูกเพิ่ม", async () => {
    const cup = addProduct(db, { name: "แก้วเซรามิก", price: 120 });

    const result = await attempt(addToCartAction({ variantId: cup.variantIds[0], quantity: "1" }));

    expect(result.redirect).toBe(`/login?next=${encodeURIComponent(`/products/${cup.id}`)}`);
    expect(allCartRows()).toBe(0);
  });

  test("CRT-003 เปิดหน้าตะกร้าหรือแก้ตะกร้าโดยไม่เข้าสู่ระบบ ถูกพาไปหน้าเข้าสู่ระบบ ไม่มีอะไรเปลี่ยน", async () => {
    expect((await page()).redirect).toBe("/login?next=%2Fcart");
    expect((await attempt(removeItemAction(1))).redirect).toBe("/login?next=%2Fcart&notice=relogin");
    expect(allCartRows()).toBe(0);
  });
});

describe("CRT-006 หน้าตะกร้าแยกตามร้าน", () => {
  test("CRT-006 แสดงรูป ชื่อ แบบย่อย ราคาต่อชิ้น จำนวน ราคารวม และชื่อร้านกดไปหน้าร้านได้", async () => {
    const buyer = signIn();
    const shop = addShop(db, { name: "บ้านผ้า" }).id;
    const shirt = addProduct(db, {
      shopId: shop,
      name: "เสื้อยืดคอกลม",
      price: 250,
      options: [{ name: "สี", values: ["ดำ"] }],
      images: ["/sample-images/shirt.svg"],
    });
    addCartItem(db, { accountId: buyer, variantId: shirt.variantIds[0], quantity: 2 });

    const { html } = await page();

    expect(html).toContain(`<a href="/shops/${shop}">บ้านผ้า</a>`);
    expect(html).toContain(`<a href="/products/${shirt.id}">เสื้อยืดคอกลม</a>`);
    expect(html).toContain('src="/sample-images/shirt.svg"');
    expect(html).toContain(">ดำ</p>");
    expect(html).toContain("฿250 ต่อชิ้น");
    expect(html).toContain('value="2"');
    expect(html).toContain("฿500");
  });

  test("CRT-006 หน้าตะกร้าแสดงเฉพาะของบัญชีที่เข้าสู่ระบบ ไม่มีที่อยู่ให้เปิดตะกร้าของคนอื่น", async () => {
    const somying = addAccount(db).id;
    addCartItem(db, { accountId: somying, variantId: addProduct(db, { name: "ของสมหญิง" }).variantIds[0] });
    const buyer = signIn();
    addCartItem(db, { accountId: buyer, variantId: addProduct(db, { name: "ของสมชาย" }).variantIds[0] });

    const { html } = await page();
    expect(html).toContain("ของสมชาย");
    expect(html).not.toContain("ของสมหญิง");
  });
});

describe("CRT-007 หน้าตะกร้าว่าง", () => {
  test("CRT-007 ตะกร้าว่างแสดงข้อความและปุ่มไปหน้าแรก ไม่มียอดรวมหรือปุ่มสั่งซื้อ ไอคอนไม่มีตัวเลข", async () => {
    signIn();
    const { html } = await page();

    expect(html).toContain("ตะกร้ายังว่าง");
    expect(html).toContain('<a class="button" href="/">เลือกซื้อสินค้า</a>');
    expect(html).not.toContain("สั่งซื้อ<");
    expect(html).not.toContain("฿");
    expect(await header()).toContain(">ตะกร้า</a>");
  });

  test("CRT-007 ลบรายการสุดท้ายไม่สำเร็จ ยังเห็นรายการพร้อมข้อความผิดพลาด ไม่เป็นหน้าว่าง", async () => {
    const buyer = signIn();
    addCartItem(db, { accountId: buyer, variantId: addProduct(db, { name: "แก้วเซรามิก" }).variantIds[0] });

    const { html } = await page();
    const summary = renderToStaticMarkup(
      <CartSummary cart={getCart(db, buyer)} pending={false} allSelected onSelectAll={noop} onCheckout={noop} onRetry={noop} />,
    );

    expect(html).toContain("แก้วเซรามิก");
    expect(html).not.toContain("ตะกร้ายังว่าง");
    expect(summary).toContain("ทำรายการไม่สำเร็จ กรุณาลองใหม่");
  });
});

describe("CRT-008 หน้าตะกร้ากำลังโหลด", () => {
  test("CRT-008 ระหว่างโหลดเห็นโครงสีเทา ไม่มีข้อความตะกร้าว่าง ยอดรวม หรือปุ่มสั่งซื้อ", () => {
    const html = renderToStaticMarkup(<CartLoadingPage />);
    expect(html).toContain('role="status"');
    expect(html).toMatch(/class="_skeleton_\w+/);
    expect(html).not.toContain("ตะกร้ายังว่าง");
    expect(html).not.toContain("฿");
    expect(html).not.toContain("<button");
  });

  test("CRT-008 โหลดไม่สำเร็จ เห็นข้อความผิดพลาดพร้อมปุ่มลองใหม่ ไม่ใช่ข้อความตะกร้าว่าง", () => {
    const html = renderToStaticMarkup(<CartError error={new Error("ช้า")} retry={noop} />);
    expect(html).toContain("ทำรายการไม่สำเร็จ กรุณาลองใหม่");
    expect(html).toContain(">ลองใหม่</button>");
    expect(html).not.toContain("ตะกร้ายังว่าง");
  });
});

describe("CRT-009 โหลดหรือบันทึกตะกร้าไม่สำเร็จ", () => {
  test("CRT-009 บันทึกไม่สำเร็จ แถบยอดรวมแสดงข้อความพร้อมปุ่มลองใหม่ กดแล้วบันทึกได้", async () => {
    const buyer = signIn();
    addCartItem(db, { accountId: buyer, variantId: addProduct(db, { price: 250 }).variantIds[0], quantity: 2 });
    const cart = getCart(db, buyer);
    const html = renderToStaticMarkup(
      <CartSummary cart={cart} pending={false} allSelected onSelectAll={noop} onCheckout={noop} onRetry={noop} />,
    );
    expect(html).toContain("ทำรายการไม่สำเร็จ กรุณาลองใหม่");
    expect(html).toContain(">ลองใหม่</button>");

    expect(await settle(Promise.reject(new Error("เน็ตหลุด")))).toBeNull();
    await settle(changeQuantityAction(items(cart)[0].id, "3"));
    expect(getCart(db, buyer).total).toBe(750);
  });

  test("CRT-009 ไม่ได้ผลใน 10 วินาทีถือว่าไม่สำเร็จ และเปิดตะกร้าใหม่เห็นจำนวนเดิม", async () => {
    const buyer = signIn();
    addCartItem(db, { accountId: buyer, variantId: addProduct(db, { price: 250 }).variantIds[0], quantity: 2 });
    vi.useFakeTimers();

    const waiting = settle(new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(10_000);

    expect(await waiting).toBeNull();
    expect((await page()).html).toContain('value="2"');
  });
});

describe("CRT-010 เปลี่ยนจำนวน", () => {
  const line = (quantity: number) => {
    const buyer = signIn();
    addCartItem(db, { accountId: buyer, variantId: addProduct(db, { stock: 10 }).variantIds[0], quantity });
    const item = items(getCart(db, buyer))[0];
    const html = renderToStaticMarkup(
      <CartLine item={item} pending={false} message={null} onSelect={noop} onQuantity={noop} onRemove={noop} />,
    );
    return { html, itemId: item.id, buyer };
  };

  test("CRT-010 ปุ่มบวกและลบกดได้ระหว่าง 1 ถึงสต็อก และบันทึกจำนวนใหม่ได้", async () => {
    const { html, itemId, buyer } = line(2);
    expect(html).toContain('aria-label="ลดจำนวน">');
    expect(html).toContain('aria-label="เพิ่มจำนวน">');

    expect((await attempt(changeQuantityAction(itemId, "3"))).value).toEqual({ message: null });
    expect(items(getCart(db, buyer))[0].quantity).toBe(3);
  });

  test("CRT-010 จำนวน 1 ปุ่มลบกดไม่ได้ ต้องใช้ปุ่มลบรายการแทน", () => {
    const { html } = line(1);
    expect(html).toContain('aria-label="ลดจำนวน" disabled="">');
    expect(html).toContain(">ลบ</button>");
  });
});

describe("CRT-011 ลบรายการ", () => {
  test("CRT-011 หน้าต่างถามก่อนลบ ยืนยันแล้วรายการหาย ไอคอนตะกร้านับใหม่", async () => {
    const dialog = renderToStaticMarkup(<ConfirmRemove onConfirm={noop} onCancel={noop} />);
    expect(dialog).toContain("ลบสินค้านี้ออกจากตะกร้า?");
    expect(dialog).toContain(">ยืนยัน</button>");
    expect(dialog).toContain(">ยกเลิก</button>");

    const buyer = signIn();
    addCartItem(db, { accountId: buyer, variantId: addProduct(db).variantIds[0] });
    const cup = addCartItem(db, { accountId: buyer, variantId: addProduct(db, { name: "แก้วเซรามิก" }).variantIds[0] });
    await attempt(removeItemAction(cup.id));

    expect((await page()).html).not.toContain("แก้วเซรามิก");
    expect(await header()).toContain(">ตะกร้า (1)</a>");
  });

  test("CRT-011 ยืนยันลบรายการที่ถูกลบไปแล้ว ไม่มีข้อความผิดพลาด", async () => {
    const buyer = signIn();
    const cup = addCartItem(db, { accountId: buyer, variantId: addProduct(db).variantIds[0] });
    await attempt(removeItemAction(cup.id));
    expect((await attempt(removeItemAction(cup.id))).value).toEqual({ message: null });
  });
});

describe("CRT-012 เลือกรายการและดูยอดรวม", () => {
  test("CRT-012 แสดงยอดรวม จำนวนชิ้น และข้อความยังไม่รวมค่าส่ง", async () => {
    const buyer = signIn();
    addCartItem(db, { accountId: buyer, variantId: addProduct(db, { price: 250 }).variantIds[0], quantity: 2 });
    addCartItem(db, { accountId: buyer, variantId: addProduct(db, { price: 120 }).variantIds[0] });

    const { html } = await page();
    expect(html).toContain("฿620");
    expect(html).toContain("3 ชิ้น · ยังไม่รวมค่าส่ง");
    expect(html).toMatch(/<button type="button" class="button">สั่งซื้อ<\/button>/);
  });

  test("CRT-012 เลิกเลือกทุกรายการ ยอดรวม 0 บาท และปุ่มสั่งซื้อกดไม่ได้", async () => {
    const buyer = signIn();
    const shirt = addCartItem(db, { accountId: buyer, variantId: addProduct(db, { price: 250 }).variantIds[0] });
    await attempt(selectItemsAction([shirt.id], false));

    const { html } = await page();
    expect(html).toContain("฿0");
    expect(html).toMatch(/<button type="button" class="button" disabled="">สั่งซื้อ<\/button>/);
  });
});

describe("CRT-013 แจ้งเมื่อราคาเปลี่ยน", () => {
  test("CRT-013 รายการบอกว่าราคาเปลี่ยนจากเท่าไรเป็นเท่าไร", async () => {
    const buyer = signIn();
    const shirt = addProduct(db, { price: 250 });
    addCartItem(db, { accountId: buyer, variantId: shirt.variantIds[0] });
    db.prepare("UPDATE variants SET price = 300 WHERE id = ?").run(shirt.variantIds[0]);

    expect((await page()).html).toContain("ราคาเปลี่ยนจาก ฿250 เป็น ฿300");
  });

  test("CRT-013 ราคาเท่าเดิมไม่มีข้อความแจ้ง", async () => {
    const buyer = signIn();
    addCartItem(db, { accountId: buyer, variantId: addProduct(db, { price: 250 }).variantIds[0] });
    expect((await page()).html).not.toContain("ราคาเปลี่ยน");
  });
});

describe("CRT-014 รายการที่ซื้อไม่ได้", () => {
  test("CRT-014 สีจางพร้อมเหตุผล เลือกหรือเปลี่ยนจำนวนไม่ได้ แต่ลบได้", async () => {
    const buyer = signIn();
    addCartItem(db, { accountId: buyer, variantId: addProduct(db, { name: "รองเท้าผ้าใบ", stock: 0 }).variantIds[0] });

    const { html } = await page();
    expect(html).toMatch(/<li class="_item_\w+ _faded_\w+">/);
    expect(html).toContain("สินค้าหมด");
    expect(html).toContain('aria-label="เลือก รองเท้าผ้าใบ" disabled=""');
    expect(html).toContain('aria-label="เพิ่มจำนวน" disabled=""');
    expect(html).toMatch(/<button type="button" class="_remove_\w+">ลบ<\/button>/);
  });

  test("CRT-014 สต็อกลดลงต่ำกว่าจำนวนในตะกร้า เห็นข้อความปรับจำนวน", async () => {
    const buyer = signIn();
    const shoe = addProduct(db, { stock: 3 });
    addCartItem(db, { accountId: buyer, variantId: shoe.variantIds[0], quantity: 3 });
    db.prepare("UPDATE variants SET stock = 2 WHERE id = ?").run(shoe.variantIds[0]);

    expect((await page()).html).toContain("ปรับจำนวนเหลือ 2 ชิ้น เพราะสินค้าเหลือ 2 ชิ้น");
  });
});

describe("CRT-015 ไปหน้าสั่งซื้อ", () => {
  test("CRT-015 ทุกอย่างตรงกับหน้าจอ ถูกพาไปหน้าสั่งซื้อ และตะกร้ายังครบ", async () => {
    const buyer = signIn();
    addCartItem(db, { accountId: buyer, variantId: addProduct(db, { price: 250 }).variantIds[0], quantity: 2 });
    const shown = items(getCart(db, buyer)).map((item) => ({ itemId: item.id, price: item.price, quantity: item.quantity }));

    expect((await attempt(checkoutAction(shown))).redirect).toBe("/checkout");
    expect(allCartRows()).toBe(1);
  });

  test("CRT-015 ราคาเปลี่ยนหลังเปิดหน้า ยังอยู่ที่ตะกร้าพร้อมข้อความให้ตรวจอีกครั้ง", async () => {
    const buyer = signIn();
    const shirt = addProduct(db, { price: 250 });
    addCartItem(db, { accountId: buyer, variantId: shirt.variantIds[0], quantity: 2 });
    const shown = items(getCart(db, buyer)).map((item) => ({ itemId: item.id, price: item.price, quantity: item.quantity }));
    db.prepare("UPDATE variants SET price = 300 WHERE id = ?").run(shirt.variantIds[0]);

    expect((await attempt(checkoutAction(shown))).value).toEqual({ message: "มีรายการเปลี่ยนแปลง กรุณาตรวจอีกครั้ง" });
  });
});

describe("CRT-Q02 ยอดรวมระหว่างรอผล", () => {
  const summary = (pending: boolean) => {
    const buyer = signIn();
    addCartItem(db, { accountId: buyer, variantId: addProduct(db, { price: 250 }).variantIds[0] });
    return renderToStaticMarkup(
      <CartSummary cart={getCart(db, buyer)} pending={pending} allSelected onSelectAll={noop} onCheckout={noop} onRetry={null} />,
    );
  };

  test("CRT-Q02 ได้ผลแล้วแสดงยอดใหม่และปุ่มสั่งซื้อกดได้", () => {
    const html = summary(false);
    expect(html).toContain("฿250");
    expect(html).toMatch(/<button type="button" class="button">สั่งซื้อ<\/button>/);
  });

  test("CRT-Q02 ระหว่างรอ แสดงกำลังคิดแทนยอดเก่า และปุ่มสั่งซื้อกดไม่ได้", () => {
    const html = summary(true);
    expect(html).toContain("กำลังคิด…");
    expect(html).not.toContain("฿250");
    expect(html).toMatch(/<button type="button" class="button" disabled="">สั่งซื้อ<\/button>/);
  });
});

describe("CRT-Q03 ใช้บนจอมือถือได้", () => {
  const css = readFileSync(join(process.cwd(), "src/features/cart/components/cart.module.css"), "utf8");
  const rule = (selector: string) => css.match(new RegExp(`\\n${selector.replace(".", "\\.")} \\{([^}]*)\\}`))?.[1] ?? "";

  test("CRT-Q03 ปุ่มและช่องเลือกอย่างน้อย 44 จุด ยอดรวมกับปุ่มสั่งซื้อติดขอบล่างจอ", () => {
    for (const selector of [".check", ".stepper button", ".remove"]) {
      expect(rule(selector)).toContain("min-width: var(--tap)");
      expect(rule(selector)).toContain("min-height: var(--tap)");
    }
    expect(rule(".summary")).toContain("position: sticky");
    expect(rule(".summary")).toContain("bottom: 0");
  });

  test("CRT-Q03 ชื่อยาว 120 ตัวอักษรถูกตัดเหลือ 2 บรรทัด และคอลัมน์รายการไม่ดันหน้าให้กว้างเกินจอ", async () => {
    const buyer = signIn();
    addCartItem(db, { accountId: buyer, variantId: addProduct(db, { name: "ก".repeat(120) }).variantIds[0] });

    expect((await page()).html).toMatch(/<p class="_name_\w+" title="ก{120}">/);
    expect(rule(".name")).toContain("-webkit-line-clamp: 2");
    expect(rule(".item")).toContain("minmax(0, 1fr)");
  });
});
