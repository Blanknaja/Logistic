// test ระดับหน้า server action และ route ของรูป ส่วน vi.mock ลอกมาจาก src/features/account/account-pages.test.tsx

import { randomUUID } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { GET as getImage } from "@/app/product-images/[key]/route";
import { POST as uploadImage } from "@/app/product-images/route";
import SellerProductsError from "@/app/seller/products/(list)/error";
import SellerProductsLoading from "@/app/seller/products/(list)/loading";
import SellerProductsPage from "@/app/seller/products/(list)/page";
import NewProductPage from "@/app/seller/products/new/page";
import { createSession } from "@/features/account/server/sessions";
import { createProductAction } from "@/features/product-listing/actions";
import { LeaveDialog } from "@/features/product-listing/components/leave-dialog";
import { LOADING_TIMEOUT_MS } from "@/shared/ui/loading-timeout";
import { ProductForm } from "@/features/product-listing/components/product-form";
import { listCategories } from "@/features/product-listing/server/categories";
import { saveImageFile } from "@/features/product-listing/server/image-files";
import { variantCombos, type ProductValues } from "@/features/product-listing/server/product-rules";
import { streamedBody } from "@/features/product-listing/server/testing";
import type { Db } from "@/shared/db";
import { addAccount, addProduct, addShop } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";
import { PRODUCT_STATUS } from "@/shared/statuses";
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

function signInAs(accountId: number) {
  request.cookies.set(SESSION_COOKIE, createSession(db, accountId));
}

/** ผู้ขายที่มีร้านและเข้าสู่ระบบอยู่ */
function signInSeller() {
  const account = addAccount(db);
  const shop = addShop(db, { ownerAccountId: account.id });
  signInAs(account.id);
  return { accountId: account.id, shopId: shop.id };
}

function upload(shopId: number): string {
  const bytes = new Uint8Array(100);
  bytes.set([0xff, 0xd8, 0xff]);
  const saved = saveImageFile(db, shopId, bytes);
  if (!saved.ok) throw new Error(saved.error);
  return saved.url;
}

const count = (table: string) => Number(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("PRD-001 หน้ารายการสินค้าของร้าน", () => {
  function somchai23(shopId: number) {
    const statuses = [...Array(18).fill(PRODUCT_STATUS.onSale), ...Array(3).fill(PRODUCT_STATUS.hidden), ...Array(2).fill(PRODUCT_STATUS.draft)];
    statuses.forEach((status, i) =>
      addProduct(db, { shopId, status, name: `สินค้า ${i + 1}`, createdAt: new Date(Date.UTC(2026, 10, 24, 0, i)).toISOString() }),
    );
  }

  test("PRD-001 ระหว่างรอเห็นสัญลักษณ์กำลังโหลด และถือว่าโหลดไม่ได้เมื่อเกิน 10 วินาที", () => {
    const html = renderToStaticMarkup(<SellerProductsLoading />);
    expect(html).toContain('role="status"');
    expect(html).toContain("กำลังโหลดรายการสินค้า");
    expect(LOADING_TIMEOUT_MS).toBe(10_000);
  });

  test("PRD-001 เห็น 20 ชิ้นแรก ตัวกรองบอกจำนวนแต่ละสถานะ ช่วงราคา และปุ่มไปหน้าถัดไป", async () => {
    const { shopId } = signInSeller();
    somchai23(shopId);
    db.prepare("UPDATE products SET status = ? WHERE name = 'สินค้า 23'").run(PRODUCT_STATUS.onSale);
    db.prepare("UPDATE products SET status = ? WHERE name = 'สินค้า 1'").run(PRODUCT_STATUS.draft);
    addProduct(db, {
      shopId,
      name: "เสื้อยืดคอกลม",
      options: [{ name: "ขนาด", values: ["M", "L"] }],
      variants: [{ price: 250 }, { price: 290 }],
      createdAt: new Date(Date.UTC(2026, 10, 25)).toISOString(),
    });
    db.prepare("UPDATE products SET status = ? WHERE name = 'สินค้า 2'").run(PRODUCT_STATUS.deleted);

    const page = text((await open(listPage())).html);
    expect(page).toContain("ทั้งหมด 23");
    expect(page).toContain("ขายอยู่ 18");
    expect(page).toContain("ซ่อน 3");
    expect(page).toContain("ร่าง 2");
    expect(page).toContain("฿250 - ฿290");
    expect(page.indexOf("เสื้อยืดคอกลม")).toBeLessThan(page.indexOf("สินค้า 23"));
    expect(page).toContain("หน้า 1 จาก 2");
    expect(page).toContain("หน้าถัดไป");

    const second = text((await open(listPage({ page: "2" }))).html);
    expect(second).toContain("หน้าก่อนหน้า");
    expect(second).not.toContain("สินค้า 2 ");
  });

  test("PRD-001 ร้านที่ยังไม่มีสินค้า เห็นข้อความและปุ่ม เพิ่มสินค้า ปุ่มเดียว", async () => {
    signInSeller();
    const { html } = await open(listPage());

    expect(html).toContain("ร้านของคุณยังไม่มีสินค้า");
    expect(html.match(/class="button[^"]*"/g)).toHaveLength(1);
    expect(html).toContain('href="/seller/products/new"');
    expect(html).not.toContain("<form");
  });

  test("PRD-001 ค้นหาไม่เจอ เห็นข้อความ ปุ่มล้างคำค้นหา และจำนวนในตัวกรองยังเท่าเดิม", async () => {
    const { shopId } = signInSeller();
    somchai23(shopId);
    const { html } = await open(listPage({ q: "ร่ม" }));

    expect(text(html)).toContain("ไม่พบสินค้าที่ชื่อมีคำว่า ร่ม");
    expect(text(html)).toContain("ล้างคำค้นหา");
    expect(html).toContain('href="/seller/products"');
    expect(text(html)).toContain("ทั้งหมด 23");
  });

  test("PRD-001 โหลดรายการไม่ได้ เห็นข้อความและปุ่มลองใหม่ ไม่มีสินค้าถูกเปลี่ยน", () => {
    const { shopId } = signInSeller();
    somchai23(shopId);
    const retry = vi.fn();
    const html = renderToStaticMarkup(<SellerProductsError error={new Error("ช้า")} retry={retry} />);

    expect(html).toContain("โหลดรายการสินค้าไม่ได้ ลองใหม่อีกครั้ง");
    expect(html).toContain("ลองใหม่");
    expect(count("products")).toBe(23);
  });
});

describe("PRD-002 สร้างสินค้าและเปิดขายผ่านหน้าเว็บ", () => {
  test("PRD-002 กด บันทึกและเปิดขาย กลับไปหน้ารายการ เห็นข้อความ และสินค้าใหม่อยู่บนสุดเป็น ขายอยู่", async () => {
    const { shopId } = signInSeller();
    addProduct(db, { shopId, name: "ของเก่า", createdAt: "2026-11-24T00:00:00.000Z" });
    const values: ProductValues = {
      name: "เสื้อยืดคอกลม",
      description: "ผ้าฝ้าย 100%",
      categoryId: 1,
      images: [upload(shopId)],
      options: [],
      prices: { "[]": "250" },
      model: null,
    };

    const result = await submit(createProductAction(randomUUID(), "publish", values));
    expect(result.redirect).toBe("/seller/products?notice=published");

    const page = text((await open(listPage({ notice: "published" }))).html);
    expect(page).toContain("เปิดขายสินค้าแล้ว");
    expect(page.indexOf("เสื้อยืดคอกลม")).toBeLessThan(page.indexOf("ของเก่า"));
    expect(page).toContain("฿250 สต็อก 0 หมด ขายอยู่");
  });

  test("PRD-001 สต็อกรวมที่ใกล้หมดหรือหมดมีป้ายตามเกณฑ์ของ INV-002 สต็อกปกติและร่างไม่มีป้าย", async () => {
    const { shopId } = signInSeller();
    addProduct(db, { shopId, name: "มีเยอะ", stock: 6 });
    addProduct(db, { shopId, name: "ใกล้หมดแล้ว", stock: 5 });
    addProduct(db, { shopId, name: "ไม่เหลือ", stock: 0 });
    addProduct(db, { shopId, name: "ร่างใหม่", stock: 0, status: PRODUCT_STATUS.draft });

    const html = (await open(listPage())).html;
    const line = (name: string) => text(html.split("<li").find((part) => part.includes(`>${name}<`)) ?? "");
    expect(line("มีเยอะ")).not.toMatch(/ใกล้หมด|หมด/);
    expect(line("ใกล้หมดแล้ว")).toContain("สต็อก 5 ใกล้หมด");
    expect(line("ไม่เหลือ")).toContain("สต็อก 0 หมด");
    expect(line("ร่างใหม่")).toContain("สต็อก 0 ร่าง");
  });

  test("PRD-002 ข้อมูลไม่ครบ ยังอยู่ที่หน้าฟอร์มพร้อมข้อความ และยังไม่มีสินค้าใหม่", async () => {
    const { shopId } = signInSeller();
    const values: ProductValues = {
      name: "กางเกงขาสั้น",
      description: "",
      categoryId: null,
      images: [upload(shopId)],
      options: [],
      prices: { "[]": "0" },
      model: null,
    };

    const result = await submit(createProductAction(randomUUID(), "publish", values));
    expect(result.redirect).toBeUndefined();
    expect(result.state?.errors).toEqual({
      description: "กรอกรายละเอียดสินค้า",
      categoryId: "เลือกหมวดหมู่",
      "price.[]": "ราคาต้องเป็นจำนวนเต็ม 1 ถึง 1,000,000 บาท",
    });
    expect(count("products")).toBe(0);
  });

  test("PRD-002 ข้อมูลที่ไม่ได้มาจากหน้าฟอร์ม ไม่ถูกบันทึก", async () => {
    signInSeller();
    await expect(createProductAction(randomUUID(), "publish", { name: 1 })).rejects.toThrow();
    await expect(createProductAction(randomUUID(), "hide" as "draft", { name: "ก" })).rejects.toThrow();
    expect(count("products")).toBe(0);
  });

  test("PRD-002 หน้าฟอร์มสินค้าเปล่ามีทุกช่องและหมวดหมู่ 12 หมวดของแพลตฟอร์ม", async () => {
    signInSeller();
    const { html } = await open(NewProductPage());

    expect(html).toContain("เพิ่มสินค้า");
    expect(html.match(/<option value="\d+"/g)).toHaveLength(12);
    expect(html).toContain("เสื้อผ้าและแฟชั่น");
    expect(html).toContain("บันทึกร่าง");
    expect(html).toContain("บันทึกและเปิดขาย");
    expect(html).toContain("0/9");
  });
});

describe("PRD-003 ส่งรูปขึ้นและเปิดดูรูป", () => {
  const jpgBody = (size: number) => {
    const bytes = new Uint8Array(size);
    bytes.set([0xff, 0xd8, 0xff]);
    return bytes;
  };
  const post = (body: Uint8Array<ArrayBuffer>) => uploadImage(new Request("http://localhost/product-images", { method: "POST", body }));

  test("PRD-003 ผู้ขายส่งรูป JPG ได้ที่อยู่รูป และเปิดดูรูปนั้นได้", async () => {
    signInSeller();
    const response = await post(jpgBody(2048));
    expect(response.status).toBe(200);
    const { url } = (await response.json()) as { url: string };

    const image = await getImage(new Request(`http://localhost${url}`), {
      params: Promise.resolve({ key: url.split("/").pop()! }),
    } as RouteContext<"/product-images/[key]">);
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toBe("image/jpeg");
    expect((await image.arrayBuffer()).byteLength).toBe(2048);
  });

  test("PRD-003 รูปเกิน 5 MB หรือไม่ใช่ JPG PNG ไม่ถูกรับพร้อมเหตุผล", async () => {
    signInSeller();
    const large = await post(jpgBody(7 * 1024 * 1024));
    expect(large.status).toBeGreaterThanOrEqual(400);
    expect(await large.json()).toEqual({ error: "รูปต้องมีขนาดไม่เกิน 5 MB" });

    const gif = await post(new TextEncoder().encode("GIF89a"));
    expect(await gif.json()).toEqual({ error: "รูปต้องเป็นไฟล์ JPG หรือ PNG" });
    expect(count("product_image_files")).toBe(0);
  });

  test("PRD-003 รูปเกิน 5 MB ที่ส่งมาทีละก้อนโดยไม่บอกขนาด ไม่ถูกรับ และเซิร์ฟเวอร์หยุดอ่านทันทีที่เกิน", async () => {
    signInSeller();
    const { body, stats } = streamedBody(jpgBody(30 * 1024 * 1024));
    const large = await uploadImage(new Request("http://localhost/product-images", { method: "POST", body, duplex: "half" } as RequestInit));

    expect(large.status).toBe(413);
    expect(await large.json()).toEqual({ error: "รูปต้องมีขนาดไม่เกิน 5 MB" });
    expect(stats.sent).toBeLessThanOrEqual(7 * 1024 * 1024);
    expect(count("product_image_files")).toBe(0);
  });

  test("PRD-003 ที่อยู่รูปที่ไม่มีอยู่ ได้ ไม่พบ", async () => {
    const image = await getImage(new Request("http://localhost/product-images/x"), {
      params: Promise.resolve({ key: "x" }),
    } as RouteContext<"/product-images/[key]">);
    expect(image.status).toBe(404);
  });

  test("PRD-003 รูป 3 รูป รูปแรกมีป้าย รูปปก และตัวนับแสดง 3/9", () => {
    const html = renderToStaticMarkup(
      <ProductForm
        categories={[]}
        initial={{ name: "เสื้อยืดคอกลม", description: "", categoryId: null, images: ["/a", "/b", "/c"], options: [], prices: {}, model: null }}
        save={async () => ({ errors: {} })}
      />,
    );
    expect(html.match(/>รูปปก</g)).toHaveLength(1);
    expect(html).toContain("3/9");
  });
});

describe("PRD-004 ตัวเลือกในหน้าฟอร์ม", () => {
  const form = (options: ProductValues["options"]) =>
    renderToStaticMarkup(
      <ProductForm
        categories={[]}
        initial={{ name: "เสื้อยืดคอกลม", description: "", categoryId: null, images: [], options, prices: {}, model: null }}
        save={async () => ({ errors: {} })}
      />,
    );

  test("PRD-004 สีกับขนาดอย่างละ 2 ค่า เห็นตารางแบบย่อย 4 แถวพร้อมช่องราคาของแต่ละแถว", () => {
    const html = form([
      { name: "สี", values: ["แดง", "ดำ"] },
      { name: "ขนาด", values: ["M", "L"] },
    ]);
    const rows = [...html.matchAll(/<th scope="row">([^<]+)<\/th>/g)].map((match) => match[1]);
    expect(rows).toEqual(["แดง M", "แดง L", "ดำ M", "ดำ L"]);
    expect(html.match(/aria-label="ราคา /g)).toHaveLength(4);
  });

  test("PRD-004 มีตัวเลือกครบ 2 แล้ว ปุ่ม เพิ่มตัวเลือก กดไม่ได้และบอกเหตุผล", () => {
    const html = form([
      { name: "สี", values: ["แดง"] },
      { name: "ขนาด", values: ["M"] },
    ]);
    expect(html).toMatch(/<button type="button" class="button button-secondary" disabled="" aria-describedby="options-full">เพิ่มตัวเลือก/);
    expect(html).toContain("ใส่ตัวเลือกได้ไม่เกิน 2 ตัวเลือก");
  });

  test("PRD-004 มีตัวเลือกเดียว ยังเพิ่มตัวเลือกได้", () => {
    const html = form([{ name: "สี", values: ["แดง"] }]);
    expect(html).not.toContain("ใส่ตัวเลือกได้ไม่เกิน 2 ตัวเลือก");
    expect(html).toMatch(/<button type="button" class="button button-secondary">เพิ่มตัวเลือก/);
  });
});

describe("PRD-005 บันทึกร่างผ่านหน้าเว็บ", () => {
  test("PRD-005 กด บันทึกร่าง เห็นข้อความ และรายการแสดงสินค้าเป็น ร่าง พร้อมรูปแทนว่ายังไม่มีรูป", async () => {
    signInSeller();
    const values: ProductValues = { name: "หมวกแก๊ป", description: "", categoryId: null, images: [], options: [], prices: { "[]": "120" }, model: null };

    expect((await submit(createProductAction(randomUUID(), "draft", values))).redirect).toBe("/seller/products?notice=draft");
    const page = text((await open(listPage({ notice: "draft" }))).html);
    expect(page).toContain("บันทึกร่างแล้ว");
    expect(page).toContain("ไม่มีรูป หมวกแก๊ป ฿120 สต็อก 0 ร่าง");
  });

  test("PRD-005 ไม่กรอกชื่อ เห็นข้อความ และยังไม่มีสินค้าใหม่ในร้าน", async () => {
    signInSeller();
    const values: ProductValues = { name: "", description: "", categoryId: null, images: [], options: [], prices: { "[]": "120" }, model: null };

    const result = await submit(createProductAction(randomUUID(), "draft", values));
    expect(result.state?.errors).toEqual({ name: "กรอกชื่อสินค้าก่อนบันทึกร่าง" });
    expect(count("products")).toBe(0);
  });
});

describe("PRD-012 จัดการได้เฉพาะสินค้าของร้านตัวเอง", () => {
  test("PRD-012 เจ้าของร้านเห็นสินค้าของร้านตัวเอง", async () => {
    const { shopId } = signInSeller();
    addProduct(db, { shopId, name: "เสื้อยืดคอกลม", price: 250 });
    expect(text((await open(listPage())).html)).toContain("เสื้อยืดคอกลม");
  });

  test("PRD-012 ผู้ขายร้านอื่นไม่เห็นสินค้าของร้านนี้ แม้เป็นร่าง", async () => {
    const owner = addShop(db);
    addProduct(db, { shopId: owner.id, name: "เสื้อยืดคอกลม", status: PRODUCT_STATUS.draft });
    signInSeller();
    const { html } = await open(listPage());
    expect(html).not.toContain("เสื้อยืดคอกลม");
    expect(html).toContain("ร้านของคุณยังไม่มีสินค้า");
  });

  test("PRD-012 บัญชีที่ยังไม่มีร้าน ถูกพาไปหน้าเปิดร้าน ทั้งหน้ารายการ หน้าฟอร์ม การบันทึก และการส่งรูป", async () => {
    signInAs(addAccount(db).id);
    expect((await open(listPage())).redirect).toBe("/open-shop");
    expect((await open(NewProductPage())).redirect).toBe("/open-shop");
    const values: ProductValues = { name: "หมวก", description: "", categoryId: null, images: [], options: [], prices: {}, model: null };
    expect((await submit(createProductAction(randomUUID(), "draft", values))).redirect).toBe("/open-shop");
    expect((await uploadImage(new Request("http://localhost/product-images", { method: "POST", body: "x" }))).status).toBe(401);
    expect(count("products")).toBe(0);
  });

  test("PRD-012 ผู้ดูแลแพลตฟอร์มไม่มีร้าน สร้างหรือแก้สินค้าแทนร้านไม่ได้", async () => {
    signInAs(addAccount(db, { isAdmin: true }).id);
    expect((await open(listPage())).redirect).toBe("/open-shop");
    expect((await submit(createProductAction(randomUUID(), "publish", { name: "x" }))).redirect).toBe("/open-shop");
  });

  test("PRD-012 ยังไม่เข้าสู่ระบบ ถูกพาไปหน้าเข้าสู่ระบบก่อน แล้วกลับมาหน้าเดิม", async () => {
    expect((await open(listPage())).redirect).toBe("/login?next=%2Fseller%2Fproducts");
    expect((await open(NewProductPage())).redirect).toBe("/login?next=%2Fseller%2Fproducts%2Fnew");
    const values: ProductValues = { name: "หมวก", description: "", categoryId: null, images: [], options: [], prices: {}, model: null };
    expect((await submit(createProductAction(randomUUID(), "draft", values))).redirect).toBe(
      "/login?next=%2Fseller%2Fproducts%2Fnew&notice=relogin",
    );
  });

  test("PRD-012 ใช้รูปที่ร้านอื่นส่งขึ้นมาไม่ได้", async () => {
    const other = addShop(db);
    signInSeller();
    const values: ProductValues = {
      name: "เสื้อ",
      description: "ผ้า",
      categoryId: 1,
      images: [upload(other.id)],
      options: [],
      prices: { "[]": "100" },
      model: null,
    };
    expect((await submit(createProductAction(randomUUID(), "publish", values))).state?.errors.images).toBe("ไม่พบรูปบางรูป ลบรูปนั้นแล้วใส่ใหม่");
    expect(count("products")).toBe(0);
  });
});

describe("PRD-014 ออกจากหน้าฟอร์มกลางทาง", () => {
  test("PRD-014 หน้าฟอร์มมีปุ่มกลับไปรายการสินค้า", () => {
    const html = renderToStaticMarkup(<ProductForm categories={[]} save={async () => ({ errors: {} })} />);
    expect(html).toContain('href="/seller/products"');
    expect(html).toContain("กลับไปรายการสินค้า");
    expect(html).not.toContain("ยังไม่ได้บันทึก");
  });

  test("PRD-014 หน้าต่างถามยืนยันมีคำถาม ปุ่มออกโดยไม่บันทึก และปุ่มอยู่ต่อ", () => {
    const html = renderToStaticMarkup(<LeaveDialog onLeave={() => {}} onStay={() => {}} />);
    expect(html).toContain("ยังไม่ได้บันทึก ออกจากหน้านี้ใช่ไหม");
    expect(html).toContain("ออกโดยไม่บันทึก");
    expect(html).toContain("อยู่ต่อ");
  });

  test("PRD-014 กรอกสินค้าใหม่แล้วออกโดยไม่บันทึก ร้านไม่มีสินค้าใหม่ เพราะระบบไม่บันทึกให้เอง", async () => {
    const { shopId } = signInSeller();
    upload(shopId);
    upload(shopId);
    await open(NewProductPage());
    expect(count("products")).toBe(0);
  });
});

describe("PRD-Q01 ความเร็วของหน้าฟอร์มสินค้า", () => {
  test("PRD-Q01 สินค้ารูป 9 รูป แบบย่อย 100 แบบ แสดงหน้าฟอร์มเสร็จเร็วกว่า 2 วินาทีมาก", () => {
    const options = [
      { name: "สี", values: Array.from({ length: 10 }, (_, i) => `สี${i}`) },
      { name: "ขนาด", values: Array.from({ length: 10 }, (_, i) => `ขนาด${i}`) },
    ];
    const prices = Object.fromEntries(variantCombos(options).map((combo) => [combo.key, "100"]));
    const images = Array.from({ length: 9 }, (_, i) => `/sample-images/p${i}.svg`);

    const started = performance.now();
    const html = renderToStaticMarkup(
      <ProductForm
        categories={listCategories(db)}
        initial={{ name: "เสื้อ", description: "ผ้า", categoryId: 1, images, options, prices, model: null }}
        save={async () => ({ errors: {} })}
      />,
    );
    expect(performance.now() - started).toBeLessThan(1000);
    expect(html.match(/<th scope="row">/g)).toHaveLength(100);
    expect(html).toContain("9/9");
  });

  test("PRD-Q01 หน้ารายการที่ช้าเกิน 10 วินาทีขึ้นหน้าผิดพลาดตาม PRD-001 ไม่ใช่หน้าว่าง", () => {
    const html = renderToStaticMarkup(<SellerProductsLoading />);
    expect(html).not.toContain("ร้านของคุณยังไม่มีสินค้า");
    expect(LOADING_TIMEOUT_MS).toBe(10_000);
  });
});
