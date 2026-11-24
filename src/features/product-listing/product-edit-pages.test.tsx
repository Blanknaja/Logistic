// test ระดับหน้าและ server action ของการแก้ไข ซ่อน และลบสินค้า ส่วน vi.mock ลอกมาจาก src/features/account/account-pages.test.tsx

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import EditProductError from "@/app/seller/products/[productId]/error";
import EditProductLoading from "@/app/seller/products/[productId]/loading";
import ProductNotFound from "@/app/seller/products/[productId]/not-found";
import EditProductPage from "@/app/seller/products/[productId]/page";
import SellerProductsPage from "@/app/seller/products/(list)/page";
import { createSession } from "@/features/account/server/sessions";
import { createProductAction, deleteProductAction, setHiddenAction, updateProductAction } from "@/features/product-listing/actions";
import { ConflictAlert } from "@/features/product-listing/components/product-form";
import { saveImageFile } from "@/features/product-listing/server/image-files";
import type { ProductValues } from "@/features/product-listing/server/product-rules";
import { getProductForEdit } from "@/features/product-listing/server/products";
import type { Db } from "@/shared/db";
import { addAccount, addProduct, addShop } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";
import { PRODUCT_STATUS, type ProductStatus } from "@/shared/statuses";
import { SESSION_COOKIE } from "@/shared/session";
import { ACTION_TIMEOUT_MS, settle } from "@/shared/ui/timeout";

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
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

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

async function open(page: Promise<React.ReactNode>): Promise<{ redirect?: string; html: string }> {
  try {
    return { html: renderToStaticMarkup(await page) };
  } catch (error) {
    if (error instanceof request.Redirected) return { redirect: error.url, html: "" };
    throw error;
  }
}

async function submit<T>(action: Promise<T>): Promise<{ redirect?: string; state?: T }> {
  try {
    return { state: await action };
  } catch (error) {
    if (error instanceof request.Redirected) return { redirect: error.url };
    throw error;
  }
}

const listPage = (searchParams: Record<string, string> = {}) =>
  SellerProductsPage({ params: Promise.resolve({}), searchParams: Promise.resolve(searchParams) } as PageProps<"/seller/products">);
const editPage = (productId: number) =>
  EditProductPage({ params: Promise.resolve({ productId: String(productId) }) } as PageProps<"/seller/products/[productId]">);

function signInSeller() {
  const account = addAccount(db);
  const shop = addShop(db, { ownerAccountId: account.id });
  request.cookies.set(SESSION_COOKIE, createSession(db, account.id));
  return shop.id;
}

const at = (time: string) => `2026-11-25T${time}:00.000+07:00`;
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const statusOf = (productId: number) => db.prepare("SELECT status FROM products WHERE id = ?").get(productId)?.status;
/** ข้อความของแถวสินค้าชื่อนี้ในหน้ารายการ */
const row = (html: string, name: string) => text(html.split("<li").find((part) => part.includes(`>${name}<`)) ?? "");

function tshirt(shopId: number, status: ProductStatus = PRODUCT_STATUS.onSale) {
  return addProduct(db, {
    shopId,
    status,
    name: "เสื้อยืดคอกลม",
    description: "ผ้าฝ้าย 100%",
    images: ["/sample-images/a.svg", "/sample-images/b.svg", "/sample-images/c.svg"],
    options: [
      { name: "สี", values: ["แดง", "ดำ"] },
      { name: "ขนาด", values: ["M", "L"] },
    ],
    variants: [{ price: 250 }, { price: 250 }, { price: 270 }, { price: 290 }],
    createdAt: new Date(at("10:15")).toISOString(),
  });
}

function edit(shopId: number, productId: number) {
  const product = getProductForEdit(db, shopId, productId);
  if (!product) throw new Error("ไม่พบสินค้า");
  return product;
}

const withPrice = (values: ProductValues, label: string[], price: string): ProductValues => ({
  ...values,
  prices: { ...values.prices, [JSON.stringify(label)]: price },
});

describe("PRD-006 เปิดหน้าฟอร์มเพื่อแก้ไขสินค้า", () => {
  test("PRD-006 ระหว่างรอเห็นสัญลักษณ์กำลังโหลดแทนฟอร์ม", () => {
    const html = renderToStaticMarkup(<EditProductLoading />);
    expect(html).toContain('role="status"');
    expect(html).toContain("กำลังโหลดข้อมูลสินค้า");
    expect(html).not.toContain("<input");
  });

  test("PRD-006 เห็นข้อมูลที่บันทึกไว้ครบทุกช่อง และด้านบนแสดง ขายอยู่ แก้ล่าสุด 10:15", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(at("11:00")));
    const shopId = signInSeller();
    const product = tshirt(shopId);
    const { html } = await open(editPage(product.id));
    vi.setSystemTime(new Date("2026-11-26T09:00:00.000+07:00"));
    const nextDay = text((await open(editPage(product.id))).html);
    vi.useRealTimers();

    expect(text(html)).toContain("ขายอยู่ แก้ล่าสุด 10:15");
    expect(nextDay).toContain("ขายอยู่ แก้ล่าสุด 25/11/2026 10:15");
    expect(html).toContain('value="เสื้อยืดคอกลม"');
    expect(html).toContain("ผ้าฝ้าย 100%");
    expect(html).toContain('<option value="1" selected="">เสื้อผ้าและแฟชั่น</option>');
    expect(html.match(/alt="รูปที่ \d"/g)).toHaveLength(3);
    expect([...html.matchAll(/<th scope="row">([^<]+)<\/th>/g)].map((match) => match[1])).toEqual(["แดง M", "แดง L", "ดำ M", "ดำ L"]);
    expect([...html.matchAll(/aria-label="ราคา [^"]+"[^>]*value="(\d+)"|value="(\d+)"[^>]*aria-label="ราคา /g)].map((m) => m[1] ?? m[2])).toEqual([
      "250",
      "250",
      "270",
      "290",
    ]);
    expect(text(html)).toContain("บันทึก");
    expect(html).not.toContain("บันทึกร่าง");
    expect(html).not.toContain("บันทึกและเปิดขาย");
  });

  test("PRD-006 ร่างที่เปิดมาแก้ยังมีปุ่ม บันทึกร่าง และ บันทึกและเปิดขาย", async () => {
    const shopId = signInSeller();
    const draft = addProduct(db, { shopId, status: PRODUCT_STATUS.draft, name: "หมวกแก๊ป", price: 120 });
    const { html } = await open(editPage(draft.id));
    expect(html).toContain("บันทึกร่าง");
    expect(html).toContain("บันทึกและเปิดขาย");
  });

  test("PRD-006 โหลดข้อมูลไม่ได้ เห็นข้อความ ปุ่มลองใหม่ และปุ่มกลับไปรายการสินค้า ไม่มีฟอร์มเปล่า", () => {
    const retry = vi.fn();
    const html = renderToStaticMarkup(<EditProductError error={new Error("ช้า")} retry={retry} />);

    expect(html).toContain("โหลดข้อมูลสินค้าไม่ได้ ลองใหม่อีกครั้ง");
    expect(html).toContain("ลองใหม่");
    expect(html).toContain('href="/seller/products"');
    expect(html).toContain("กลับไปรายการสินค้า");
    expect(html).not.toContain("<input");
  });

  test("PRD-006 สินค้าที่ถูกลบแล้ว เห็น ไม่พบสินค้านี้ พร้อมปุ่มกลับไปรายการสินค้า", async () => {
    const shopId = signInSeller();
    const socks = addProduct(db, { shopId, name: "ถุงเท้า", status: PRODUCT_STATUS.deleted });

    expect((await open(editPage(socks.id))).redirect).toBe("not-found");
    const html = renderToStaticMarkup(<ProductNotFound />);
    expect(html).toContain("ไม่พบสินค้านี้");
    expect(html).toContain('href="/seller/products"');
  });

  test("PRD-006 ผู้ขายร้านอื่นเปิดลิงก์หน้าแก้ไข เห็น ไม่พบ และไม่เห็นข้อมูลในฟอร์ม", async () => {
    const product = tshirt(addShop(db).id);
    signInSeller();
    expect(await open(editPage(product.id))).toEqual({ redirect: "not-found", html: "" });
  });
});

describe("PRD-007 บันทึกการแก้ไขสินค้า", () => {
  test("PRD-007 แก้ราคา ดำ L เป็น 310 กด บันทึก เห็น บันทึกแล้ว ยัง ขายอยู่ และช่วงราคาเป็น 250 ถึง 310", async () => {
    const shopId = signInSeller();
    const product = tshirt(shopId);
    const form = edit(shopId, product.id);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(at("13:10")));
    const result = await submit(updateProductAction(product.id, form.updatedAt, "publish", withPrice(form.values, ["ดำ", "L"], "310")));
    expect(result.redirect).toBe("/seller/products?notice=saved");

    const page = text((await open(listPage({ notice: "saved" }))).html);
    vi.useRealTimers();
    expect(page).toContain("บันทึกแล้ว");
    expect(page).toContain("฿250 - ฿310 สต็อก 40 ขายอยู่");
    expect(page).toContain("แก้ล่าสุด 13:10");
  });

  test("PRD-007 ร่างที่กด บันทึกและเปิดขาย เห็น เปิดขายสินค้าแล้ว", async () => {
    const shopId = signInSeller();
    const draft = addProduct(db, { shopId, status: PRODUCT_STATUS.draft, price: 120 });
    const form = edit(shopId, draft.id);
    expect((await submit(updateProductAction(draft.id, form.updatedAt, "publish", form.values))).redirect).toBe(
      "/seller/products?notice=published",
    );
    expect(statusOf(draft.id)).toBe(PRODUCT_STATUS.onSale);
  });

  test("PRD-007 ลบรูปออกทั้งหมด เห็น ใส่รูปอย่างน้อย 1 รูป และการแก้ไม่ถูกบันทึก", async () => {
    const shopId = signInSeller();
    const product = tshirt(shopId);
    const form = edit(shopId, product.id);

    const result = await submit(updateProductAction(product.id, form.updatedAt, "publish", { ...form.values, images: [] }));
    expect(result.state?.errors).toEqual({ images: "ใส่รูปอย่างน้อย 1 รูป" });
    expect(edit(shopId, product.id)).toEqual(form);
  });

  test("PRD-007 ยืนยันการบันทึกไม่ได้ใน 10 วินาที ได้ผลว่าไม่สำเร็จ ฟอร์มจึงขึ้นข้อความและให้บันทึกใหม่ได้", async () => {
    vi.useFakeTimers();
    try {
      const pending = settle(new Promise(() => {}));
      await vi.advanceTimersByTimeAsync(ACTION_TIMEOUT_MS);
      expect(await pending).toEqual({ failed: true });
    } finally {
      vi.useRealTimers();
    }
  });

  test("PRD-007 ข้อมูลที่ไม่ได้มาจากหน้าฟอร์ม ไม่ถูกบันทึก", async () => {
    const shopId = signInSeller();
    const product = tshirt(shopId);
    const form = edit(shopId, product.id);
    await expect(updateProductAction(product.id, form.updatedAt, "publish", { name: 1 })).rejects.toThrow();
    await expect(updateProductAction("1" as unknown as number, form.updatedAt, "publish", form.values)).rejects.toThrow();
    expect(edit(shopId, product.id)).toEqual(form);
  });

  test("PRD-007 แท็บที่ออกจากระบบไปแล้วกดบันทึก ถูกพาไปเข้าสู่ระบบใหม่แล้วกลับมาหน้าเดิม", async () => {
    const product = tshirt(addShop(db).id);
    const result = await submit(updateProductAction(product.id, "x", "publish", {}));
    expect(result.redirect).toBe(`/login?next=%2Fseller%2Fproducts%2F${product.id}&notice=relogin`);
  });
});

describe("PRD-008 ซ่อนและเลิกซ่อนสินค้า", () => {
  test("PRD-008 กด ซ่อน ตัวกรองเปลี่ยนเป็น ขายอยู่ 17 ซ่อน 4 และกด เลิกซ่อน กลับเป็น ขายอยู่", async () => {
    const shopId = signInSeller();
    for (let i = 0; i < 17; i++) addProduct(db, { shopId });
    for (let i = 0; i < 3; i++) addProduct(db, { shopId, status: PRODUCT_STATUS.hidden });
    const product = tshirt(shopId);

    const before = (await open(listPage())).html;
    expect(text(before)).toContain("ขายอยู่ 18");
    expect(row(before, "เสื้อยืดคอกลม")).toContain("ซ่อน");

    expect((await submit(setHiddenAction(product.id, true, "/seller/products?q=%E0%B9%80"))).redirect).toBe("/seller/products?q=%E0%B9%80");
    const hidden = (await open(listPage())).html;
    expect(text(hidden)).toContain("ขายอยู่ 17");
    expect(text(hidden)).toContain("ซ่อน 4");
    expect(row(hidden, "เสื้อยืดคอกลม")).toContain("เลิกซ่อน");

    await submit(setHiddenAction(product.id, false, "/seller/products"));
    expect(statusOf(product.id)).toBe(PRODUCT_STATUS.onSale);
  });

  test("PRD-008 ร่างไม่มีปุ่ม ซ่อน และ เลิกซ่อน มีเฉพาะ แก้ไข และ ลบ และยังเป็นร่าง", async () => {
    const shopId = signInSeller();
    const cap = addProduct(db, { shopId, name: "หมวกแก๊ป", status: PRODUCT_STATUS.draft });

    const line = row((await open(listPage())).html, "หมวกแก๊ป");
    expect(line).toContain("แก้ไข");
    expect(line).toContain("ลบ");
    expect(line).not.toContain("ซ่อน");

    await submit(setHiddenAction(cap.id, true, "/seller/products"));
    expect(statusOf(cap.id)).toBe(PRODUCT_STATUS.draft);
  });

  test("PRD-008 ซ่อนสินค้าของร้านอื่นไม่ได้ และที่อยู่กลับที่ไม่ใช่หน้ารายการถูกแทนด้วยหน้ารายการ", async () => {
    const other = addProduct(db, { shopId: addShop(db).id });
    signInSeller();
    expect((await submit(setHiddenAction(other.id, true, "https://example.com/"))).redirect).toBe("/seller/products");
    expect(statusOf(other.id)).toBe(PRODUCT_STATUS.onSale);
  });
});

describe("PRD-009 ลบสินค้า", () => {
  test("PRD-009 กด ลบ แล้วยืนยัน เห็น ลบสินค้าแล้ว รายการเหลือ 22 ชิ้น ไม่มี ถุงเท้า", async () => {
    const shopId = signInSeller();
    for (let i = 0; i < 22; i++) addProduct(db, { shopId });
    const socks = addProduct(db, { shopId, name: "ถุงเท้า" });

    const line = row((await open(listPage())).html, "ถุงเท้า");
    expect(line).toContain("ลบ ถุงเท้า ใช่ไหม ลบแล้วกู้กลับไม่ได้");

    expect((await submit(deleteProductAction(socks.id))).redirect).toBe("/seller/products?notice=deleted");
    const page = text((await open(listPage({ notice: "deleted" }))).html);
    expect(page).toContain("ลบสินค้าแล้ว");
    expect(page).toContain("ทั้งหมด 22");
    expect(page).not.toContain("ถุงเท้า");
    expect(statusOf(socks.id)).toBe(PRODUCT_STATUS.deleted);
  });

  test("PRD-009 หน้าต่างยืนยันมีปุ่ม ยกเลิก ที่ไม่ส่งการลบ สินค้ายังอยู่ด้วยสถานะเดิม", async () => {
    const shopId = signInSeller();
    const cap = addProduct(db, { shopId, name: "หมวกแก๊ป", status: PRODUCT_STATUS.draft });

    const html = (await open(listPage())).html;
    expect(html).toContain('<button type="button" class="button" autofocus="">ยกเลิก</button>');
    expect(html.match(/<button type="submit" class="button button-secondary">ลบ<\/button>/g)).toHaveLength(1);
    expect(statusOf(cap.id)).toBe(PRODUCT_STATUS.draft);
  });

  test("PRD-009 ลบสินค้าของร้านอื่นไม่ได้", async () => {
    const other = addProduct(db, { shopId: addShop(db).id });
    signInSeller();
    await submit(deleteProductAction(other.id));
    expect(statusOf(other.id)).toBe(PRODUCT_STATUS.onSale);
  });
});

describe("PRD-013 กดซ้ำ และแก้พร้อมกันจากสองหน้าต่าง", () => {
  function scarf(shopId: number): ProductValues {
    const image = saveImageFile(db, shopId, new Uint8Array([0xff, 0xd8, 0xff, 0]));
    if (!image.ok) throw new Error(image.error);
    return { name: "ผ้าพันคอ", description: "ผ้าไหม", categoryId: 1, images: [image.url], options: [], prices: { "[]": "199" } };
  }

  test("PRD-013 บันทึกจากหน้าต่างเดียว เห็น บันทึกแล้ว และราคา แดง M เป็น 260", async () => {
    const shopId = signInSeller();
    const product = tshirt(shopId);
    const form = edit(shopId, product.id);

    const result = await submit(updateProductAction(product.id, form.updatedAt, "publish", withPrice(form.values, ["แดง", "M"], "260")));
    expect(result.redirect).toBe("/seller/products?notice=saved");
    expect(edit(shopId, product.id).values.prices['["แดง","M"]']).toBe("260");
  });

  test("PRD-013 กด บันทึกและเปิดขาย สองครั้งติดกัน ร้านมี ผ้าพันคอ ชิ้นเดียว", async () => {
    const shopId = signInSeller();
    for (let i = 0; i < 22; i++) addProduct(db, { shopId });
    const values = scarf(shopId);

    const [first, second] = await Promise.all([
      submit(createProductAction("form-1", "publish", values)),
      submit(createProductAction("form-1", "publish", values)),
    ]);
    expect(first.redirect).toBe("/seller/products?notice=published");
    expect(second.redirect).toBe("/seller/products?notice=published");
    expect(text((await open(listPage())).html)).toContain("ทั้งหมด 23");
    expect(db.prepare("SELECT count(*) AS n FROM products WHERE name = 'ผ้าพันคอ'").get()?.n).toBe(1);
  });

  test("PRD-013 หน้าต่างที่สองบันทึกหลังหน้าต่างแรก เห็นเวลาที่ถูกแก้และปุ่มโหลดข้อมูลล่าสุด ชื่อใหม่ไม่ถูกบันทึก", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const shopId = signInSeller();
      const product = tshirt(shopId);
      const first = edit(shopId, product.id);
      const second = edit(shopId, product.id);

      vi.setSystemTime(new Date(at("17:12")));
      await submit(updateProductAction(product.id, first.updatedAt, "publish", withPrice(first.values, ["แดง", "M"], "270")));
      vi.setSystemTime(new Date(at("17:14")));
      const result = await submit(updateProductAction(product.id, second.updatedAt, "publish", { ...second.values, name: "ชื่อใหม่" }));

      const message = "สินค้านี้ถูกแก้ไปแล้วเมื่อ 17:12 โหลดข้อมูลล่าสุดก่อนแก้ต่อ";
      expect(result.state).toEqual({ errors: {}, conflict: message });
      const html = renderToStaticMarkup(<ConflictAlert message={message} onReload={() => {}} />);
      expect(html).toContain(message);
      expect(html).toContain("โหลดข้อมูลล่าสุด");
      expect(edit(shopId, product.id).values).toMatchObject({ name: "เสื้อยืดคอกลม", prices: { '["แดง","M"]': "270" } });
    } finally {
      vi.useRealTimers();
    }
  });

  test("PRD-013 สินค้าถูกลบระหว่างแก้ กดบันทึกแล้วกลับไปหน้าฟอร์มที่แสดง ไม่พบสินค้านี้", async () => {
    const shopId = signInSeller();
    const product = tshirt(shopId);
    const form = edit(shopId, product.id);
    db.prepare("UPDATE products SET status = ? WHERE id = ?").run(PRODUCT_STATUS.deleted, product.id);

    const result = await submit(updateProductAction(product.id, form.updatedAt, "publish", form.values));
    expect(result.redirect).toBe(`/seller/products/${product.id}`);
    expect((await open(editPage(product.id))).redirect).toBe("not-found");
  });
});
