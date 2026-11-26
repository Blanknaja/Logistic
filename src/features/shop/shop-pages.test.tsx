// test ระดับหน้าและ server action ของ shop ส่วน vi.mock ลอกมาจาก src/features/account/account-pages.test.tsx

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import ErrorPage from "@/app/error";
import OpenShopLoading from "@/app/open-shop/loading";
import OpenShopPage from "@/app/open-shop/page";
import SellerLayout from "@/app/seller/layout";
import SellerNotFound from "@/app/seller/not-found";
import SellerHomePage from "@/app/seller/page";
import SettingsLoading from "@/app/seller/settings/loading";
import SettingsPage from "@/app/seller/settings/page";
import { GET as getLogo } from "@/app/shop-logos/[logoId]/route";
import StorefrontLoading from "@/app/shops/[shopId]/loading";
import ShopNotFound from "@/app/shops/[shopId]/not-found";
import StorefrontPage from "@/app/shops/[shopId]/page";
import { createSession } from "@/features/account/server/sessions";
import { loadMoreShopProductsAction, openShopAction, saveShopSettingsAction } from "@/features/shop/actions";
import { guardedHref } from "@/features/shop/components/leave-guard";
import { formMessage, logoFileError } from "@/features/shop/components/shop-form";
import { showMore } from "@/features/shop/components/storefront-products";
import { requireShop } from "@/features/shop/require-shop";
import { getShopSettings } from "@/features/shop/server/shops";
import { listStorefrontProducts } from "@/features/shop/server/storefront";
import type { Db } from "@/shared/db";
import { addAccount, addOrder, addProduct, addShop } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";
import { SiteHeader } from "@/shared/layout/site-header";
import { SESSION_COOKIE } from "@/shared/session";
import { ORDER_STATUS, SHOP_STATUS } from "@/shared/statuses";

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

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

vi.mock("@/shared/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/db")>()),
  getDb: () => request.db,
}));

// บาง test ตรึงวันที่ไว้ในปี 2026 เพราะวันที่ของปีนี้แสดงโดยไม่มีปี
afterEach(() => void vi.useRealTimers());

let db: Db;

beforeEach(() => {
  db = createTestDb();
  request.db = db;
  request.cookies.clear();
});

async function open(page: Promise<React.ReactNode> | React.ReactNode): Promise<{ redirect?: string; html?: string }> {
  try {
    return { html: renderToStaticMarkup(await page) };
  } catch (error) {
    if (error instanceof request.Redirected) return { redirect: error.url };
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

const somchaiForm = {
  name: "ร้านสมชายผ้าไทย",
  description: "",
  senderName: "สมชาย ใจดี",
  phone: "0812345678",
  address: "99/1 ถนนสุขุมวิท",
  subdistrict: "คลองเตย",
  district: "คลองเตย",
  province: "กรุงเทพมหานคร",
  postcode: "10110",
};

const form = (values: Record<string, string>, logo?: File) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  data.set("logo", logo ?? new File([], ""));
  return data;
};

const pngFile = (size: number) => {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return new File([bytes], "logo.png", { type: "image/png" });
};

const props = (searchParams: Record<string, string> = {}, params: Record<string, string> = {}) => ({
  params: Promise.resolve(params),
  searchParams: Promise.resolve(searchParams),
});

const storefront = (shopId: number | string) => StorefrontPage(props({}, { shopId: String(shopId) }) as never);
const sellerHome = (searchParams: Record<string, string> = {}) => SellerHomePage(props(searchParams) as never);
const settings = (searchParams: Record<string, string> = {}) => SettingsPage(props(searchParams) as never);
const layout = (children: React.ReactNode = <p>เนื้อหาของหน้า</p>) => SellerLayout({ children } as never);

function signInAs(accountId: number, now?: Date): string {
  const token = createSession(db, accountId, now);
  request.cookies.set(SESSION_COOKIE, token);
  return token;
}

/** สมชายเข้าสู่ระบบแล้วเปิดร้านผ่านหน้าเว็บ */
async function somchaiOpensShop(values: Partial<typeof somchaiForm> = {}) {
  const somchai = addAccount(db, { displayName: "สมชาย" });
  signInAs(somchai.id);
  await submit(openShopAction(form({ ...somchaiForm, ...values })));
  const shop = getShopSettings(db, somchai.id);
  if (!shop) throw new Error("ต้องเปิดร้านได้");
  return { accountId: somchai.id, shopId: shop.id };
}

const shopCount = () => Number(db.prepare("SELECT count(*) AS n FROM shops").get()?.n);
const selectedOption = (html = "") => html.match(/<option[^>]*selected=""[^>]*>([^<]*)</)?.[1];
const text = (html = "") => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const header = async () => renderToStaticMarkup(await SiteHeader());

describe("SHP-001 ทางเข้าเปิดร้านและร้านของฉัน", () => {
  test("SHP-001 แถบด้านบนแสดงเปิดร้านก่อนมีร้าน และแสดงร้านของฉันหลังเปิดร้าน", async () => {
    signInAs(addAccount(db).id);
    expect(await header()).toContain('href="/open-shop"');

    await somchaiOpensShop();
    const html = await header();
    expect(html).toContain('href="/seller"');
    expect(html).not.toContain('href="/open-shop"');
  });

  test("SHP-001 ยังไม่เข้าสู่ระบบ เปิดหน้าเปิดร้านหรือหลังบ้านโดยตรง ถูกพาไปหน้าเข้าสู่ระบบแล้วกลับมาหน้าเดิม", async () => {
    expect(await open(OpenShopPage())).toEqual({ redirect: "/login?next=%2Fopen-shop" });
    expect(await open(sellerHome())).toEqual({ redirect: "/login?next=%2Fseller" });
    expect(await open(settings())).toEqual({ redirect: "/login?next=%2Fseller%2Fsettings" });
    expect(await submit(requireShop("/seller/stock"))).toEqual({ redirect: "/login?next=%2Fseller%2Fstock" });
    expect(shopCount()).toBe(0);
  });

  test("SHP-001 ยังไม่มีร้าน เปิดหน้าใดของหลังบ้าน ถูกพาไปหน้าเปิดร้าน และไม่เห็นข้อมูลของร้านใด", async () => {
    addShop(db, { name: "ร้านของคนอื่น" });
    signInAs(addAccount(db).id);

    expect(await open(layout(<p>รายการคำสั่งซื้อ</p>))).toEqual({ redirect: "/open-shop" });
    expect(await open(sellerHome())).toEqual({ redirect: "/open-shop" });
    expect(await open(settings())).toEqual({ redirect: "/open-shop" });
    expect(await submit(requireShop("/seller/orders"))).toEqual({ redirect: "/open-shop" });
    expect(shopCount()).toBe(1);
  });
});

describe("SHP-002 เปิดร้าน", () => {
  test("SHP-002 กด เปิดร้าน แล้วไปหน้าแรกของหลังบ้าน พร้อมข้อความ เปิดร้านสำเร็จ และเปิดหน้าร้านได้ทันที", async () => {
    signInAs(addAccount(db).id);

    expect(await submit(openShopAction(form(somchaiForm)))).toEqual({ redirect: "/seller?notice=opened" });
    const home = text((await open(sellerHome({ notice: "opened" }))).html);
    expect(home).toContain("เปิดร้านสำเร็จ");
    expect(home).toContain("ร้านสมชายผ้าไทย");
    expect(home).toContain(`สถานะร้าน ${SHOP_STATUS.open}`);
    const shopId = Number(db.prepare("SELECT id FROM shops").get()?.id);
    expect(text((await open(storefront(shopId))).html)).toContain("ร้านสมชายผ้าไทย");
  });

  test("SHP-002 หน้าเปิดร้านเริ่มจากฟอร์มว่าง ช่องบังคับ 8 ช่อง", async () => {
    signInAs(addAccount(db).id);
    const { html = "" } = await open(OpenShopPage());

    const names = [...html.matchAll(/<(?:input|select|textarea)[^>]*name="(\w+)"/g)].map((match) => match[1]);
    expect(names).toEqual(["removeLogo", "name", "description", "logo", "senderName", "phone", "address", "subdistrict", "district", "province", "postcode"]);
    expect(html).not.toMatch(/<input[^>]*name="(name|senderName|phone|address|subdistrict|district|postcode)"[^>]*value="[^"]/);
  });

  test("SHP-002 ระบบบันทึกไม่สำเร็จ ไม่มีร้านถูกสร้าง และฟอร์มบอกให้ลองใหม่", async () => {
    signInAs(addAccount(db).id);
    db.exec("ALTER TABLE shop_logos RENAME TO shop_logos_broken");

    await expect(openShopAction(form(somchaiForm, pngFile(1000)))).rejects.toThrow();
    expect(shopCount()).toBe(0);
    expect(formMessage("open", { failed: true }, false)).toBe("เปิดร้านไม่สำเร็จ ลองใหม่อีกครั้ง");
  });
});

describe("SHP-003 ตรวจข้อมูลร้านก่อนบันทึก", () => {
  test("SHP-003 กรอกครบตามกติกา ไม่มีข้อความผิดพลาด และไปหน้าแรกของหลังบ้าน", async () => {
    signInAs(addAccount(db).id);
    expect(await submit(openShopAction(form(somchaiForm)))).toEqual({ redirect: "/seller?notice=opened" });
  });

  test("SHP-003 ข้อมูลผิด 3 ช่อง ได้ข้อความใต้ 3 ช่องนั้น และไม่มีร้านถูกสร้าง", async () => {
    signInAs(addAccount(db).id);

    const result = await submit(openShopAction(form({ ...somchaiForm, name: "สช", phone: "08123", postcode: "" })));

    expect(result.state?.errors).toEqual({
      name: "ชื่อร้านต้องมี 3 ถึง 30 ตัวอักษร",
      phone: "เบอร์โทรต้องเป็นตัวเลข 10 หลัก ขึ้นต้นด้วย 0",
      postcode: "กรุณากรอกรหัสไปรษณีย์ 5 หลัก",
    });
    expect(shopCount()).toBe(0);
  });
});

describe("SHP-004 ชื่อร้านไม่ซ้ำกัน", () => {
  test("SHP-004 ชื่อใหม่ไม่ซ้ำ เปิดร้านได้", async () => {
    await somchaiOpensShop();
    signInAs(addAccount(db).id);

    expect(await submit(openShopAction(form({ ...somchaiForm, name: "ร้านวิชัยผ้าไทย" })))).toEqual({ redirect: "/seller?notice=opened" });
  });

  test("SHP-004 ชื่อซ้ำที่มีช่องว่างหน้าหลัง เห็นข้อความ ชื่อร้านนี้มีคนใช้แล้ว", async () => {
    await somchaiOpensShop();
    signInAs(addAccount(db).id);

    const result = await submit(openShopAction(form({ ...somchaiForm, name: " ร้านสมชายผ้าไทย " })));

    expect(result.state?.errors).toEqual({ name: "ชื่อร้านนี้มีคนใช้แล้ว" });
    expect(shopCount()).toBe(1);
  });
});

describe("SHP-005 หนึ่งบัญชีมีได้หนึ่งร้าน", () => {
  test("SHP-005 มีร้านแล้วเปิดลิงก์หน้าเปิดร้าน ถูกพาไปหน้าแรกของหลังบ้าน", async () => {
    await somchaiOpensShop();

    expect(await open(OpenShopPage())).toEqual({ redirect: "/seller" });
    expect(shopCount()).toBe(1);
  });

  test("SHP-005 หน้าจอที่สองกดเปิดร้าน ถูกพาไปร้านเดิมพร้อมข้อความ คุณมีร้านอยู่แล้ว", async () => {
    await somchaiOpensShop({ name: "ร้านวิชัยผ้าไทย" });

    expect(await submit(openShopAction(form({ ...somchaiForm, name: "ร้านวิชัย 2" })))).toEqual({ redirect: "/seller?notice=has-shop" });
    const home = text((await open(sellerHome({ notice: "has-shop" }))).html);
    expect(home).toContain("คุณมีร้านอยู่แล้ว");
    expect(home).toContain("ร้านวิชัยผ้าไทย");
    expect(db.prepare("SELECT 1 FROM shops WHERE name = ?").get("ร้านวิชัย 2")).toBeUndefined();
  });

  test("SHP-005 บัญชีผู้ดูแลแพลตฟอร์มเห็นข้อความ บัญชีนี้เปิดร้านไม่ได้", async () => {
    signInAs(addAccount(db, { isAdmin: true }).id);

    const { html = "" } = await open(OpenShopPage());
    expect(html).toContain("บัญชีนี้เปิดร้านไม่ได้");
    expect(html).not.toContain("<form");
    expect((await submit(openShopAction(form(somchaiForm)))).state).toEqual({ errors: {}, notice: "admin" });
    expect(formMessage("open", { errors: {}, notice: "admin" }, false)).toBe("บัญชีนี้เปิดร้านไม่ได้");
    expect(shopCount()).toBe(0);
  });

  test("SHP-005 ระหว่างบันทึกปุ่มขึ้นว่า กำลังบันทึก", () => {
    const source = readFileSync(join(process.cwd(), "src/features/shop/components/shop-form.tsx"), "utf8");
    expect(source).toContain('pending ? "กำลังบันทึก"');
    expect(source).toMatch(/disabled=\{pending \|\| !hydrated\}/);
  });
});

describe("SHP-006 หน้าแรกของหลังบ้าน", () => {
  test("SHP-006 แสดงชื่อร้าน สถานะ จำนวนสินค้าที่ขายอยู่ 3 และคำสั่งซื้อที่รอร้านจัดของ 2 พร้อมทางเข้าจากเมนูหลังบ้าน", async () => {
    const { shopId } = await somchaiOpensShop();
    const products = [1, 2, 3].map(() => addProduct(db, { shopId, price: 100, stock: 5 }));
    const buyer = addAccount(db);
    for (const status of [ORDER_STATUS.paid, ORDER_STATUS.paid, ORDER_STATUS.awaitingPayment]) {
      addOrder(db, { buyerAccountId: buyer.id, items: [{ variantId: products[0].variantIds[0] }], status });
    }

    const home = text((await open(sellerHome())).html);
    const menu = (await open(layout())).html ?? "";

    expect(home).toContain("ร้านสมชายผ้าไทย");
    expect(home).toContain(`สถานะร้าน ${SHOP_STATUS.open}`);
    expect(home).toContain("สินค้าที่ขายอยู่ 3");
    expect(home).toContain("คำสั่งซื้อที่รอร้านจัดของ 2");
    expect(home).not.toContain("ร้านของคุณยังไม่มีสินค้า");
    const html = (await open(sellerHome())).html ?? "";
    expect(html).toMatch(/href="\/seller\/orders\?status=paid"[^>]*>คำสั่งซื้อที่รอร้านจัดของ</);
    expect(html).toMatch(/href="\/seller\/products"[^>]*>สินค้าที่ขายอยู่</);
    expect(menu).toContain('href="/seller/settings"');
    expect(menu).toContain(`href="/shops/${shopId}"`);
    expect(menu).toContain("เนื้อหาของหน้า");
  });

  test("SHP-006 ร้านเพิ่งเปิด ตัวเลขเป็น 0 และมีปุ่ม ลงสินค้าชิ้นแรก ไปหน้าลงสินค้า", async () => {
    await somchaiOpensShop();
    const { html = "" } = await open(sellerHome());

    expect(text(html)).toContain("สินค้าที่ขายอยู่ 0");
    expect(text(html)).toContain("คำสั่งซื้อที่รอร้านจัดของ 0");
    expect(html).toContain("ร้านของคุณยังไม่มีสินค้า");
    expect(html).toMatch(/<a class="button" href="\/seller\/products\/new">ลงสินค้าชิ้นแรก<\/a>/);
  });

  test("SHP-006 ตัวเลขสต็อกใกล้หมดและหมดขึ้นก่อนจำนวนสินค้า และพาไปหน้าสต็อกที่กรองไว้แล้ว", async () => {
    const { shopId } = await somchaiOpensShop();
    for (const stock of [0, 3, 5, 6, 40]) addProduct(db, { shopId, price: 100, stock });

    const html = (await open(sellerHome())).html ?? "";
    const home = text(html);

    expect(home).toContain("สต็อกใกล้หมด 2");
    expect(home).toContain("สต็อกหมด 1");
    expect(html).toMatch(/href="\/seller\/stock\?filter=low"[^>]*>สต็อกใกล้หมด</);
    expect(html).toMatch(/href="\/seller\/stock\?filter=out"[^>]*>สต็อกหมด</);
    expect(home.indexOf("คำสั่งซื้อที่รอร้านจัดของ")).toBeLessThan(home.indexOf("สต็อกใกล้หมด"));
    expect(home.indexOf("สต็อกหมด")).toBeLessThan(home.indexOf("สินค้าที่ขายอยู่"));
  });

  test("SHP-006 นับคำสั่งซื้อไม่สำเร็จตอนร้านยังไม่มีสินค้า ปุ่มลองใหม่เป็นปุ่มรอง หน้าจึงมีปุ่มสีเน้นปุ่มเดียวคือ ลงสินค้าชิ้นแรก", async () => {
    await somchaiOpensShop();
    db.exec("ALTER TABLE orders RENAME TO orders_broken");
    vi.spyOn(console, "error").mockImplementation(() => {});

    const html = (await open(sellerHome())).html ?? "";

    expect(html).toContain('<button type="button" class="button button-secondary">ลองใหม่</button>');
    expect(html.match(/class="button"/g)).toHaveLength(1);
    expect(html).toMatch(/<a class="button" href="\/seller\/products\/new">ลงสินค้าชิ้นแรก<\/a>/);
  });

  test("SHP-006 นับคำสั่งซื้อไม่สำเร็จ แสดง – โหลดไม่สำเร็จ และปุ่มลองใหม่ ส่วนอื่นยังแสดง", async () => {
    const { shopId } = await somchaiOpensShop();
    addProduct(db, { shopId, price: 100 });
    db.exec("ALTER TABLE orders RENAME TO orders_broken");
    vi.spyOn(console, "error").mockImplementation(() => {});

    const html = (await open(sellerHome())).html ?? "";
    const home = text(html);

    expect(home).toContain("คำสั่งซื้อที่รอร้านจัดของ – โหลดไม่สำเร็จ");
    expect(html.match(/>ลองใหม่<\/button>/g)).toHaveLength(1);
    expect(html).toContain('<button type="button" class="button">ลองใหม่</button>');
    expect(home).toContain("ร้านสมชายผ้าไทย");
    expect(home).toContain("สินค้าที่ขายอยู่ 1");
    expect((await open(layout())).html).toContain('href="/seller/settings"');
  });
});

describe("SHP-007 แก้ชื่อร้านและคำอธิบายร้าน", () => {
  test("SHP-007 กดบันทึกแล้วเห็น บันทึกแล้ว และหน้าร้านลิงก์เดิมแสดงค่าใหม่", async () => {
    const { shopId } = await somchaiOpensShop();
    const data = form({ ...somchaiForm, shopId: String(shopId), name: "สมชายผ้าไทยแท้", description: "ผ้าไหมทอมือจากสุรินทร์" });

    expect(await submit(saveShopSettingsAction(data))).toEqual({ redirect: "/seller/settings?saved=1" });
    expect((await open(settings({ saved: "1" }))).html).toContain("บันทึกแล้ว");
    request.cookies.clear();
    const page = text((await open(storefront(shopId))).html);
    expect(page).toContain("สมชายผ้าไทยแท้");
    expect(page).toContain("ผ้าไหมทอมือจากสุรินทร์");
  });

  test("SHP-007 บันทึกไม่สำเร็จ ฟอร์มบอกให้ลองใหม่ และหน้าร้านยังแสดงคำอธิบายเดิม", async () => {
    const { shopId } = await somchaiOpensShop({ description: "คำอธิบายเดิม" });
    db.exec("ALTER TABLE shop_logos RENAME TO shop_logos_broken");

    await expect(
      saveShopSettingsAction(form({ ...somchaiForm, shopId: String(shopId), description: "ก".repeat(40) }, pngFile(1000))),
    ).rejects.toThrow();
    expect(formMessage("settings", { failed: true }, false)).toBe("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
    expect(text((await open(storefront(shopId))).html)).toContain("คำอธิบายเดิม");
  });
});

describe("SHP-008 โลโก้ร้าน", () => {
  test("SHP-008 เลือกรูป PNG แล้วบันทึก หน้าร้านและหลังบ้านแสดงรูปใหม่แทนตัวอักษร", async () => {
    const { shopId } = await somchaiOpensShop();
    expect((await open(storefront(shopId))).html).toMatch(/role="img"[^>]*>ร<\/span>/);

    await submit(saveShopSettingsAction(form({ ...somchaiForm, shopId: String(shopId) }, pngFile(1.2 * 1024 * 1024))));

    const logoUrl = getShopSettings(db, Number(db.prepare("SELECT owner_account_id AS id FROM shops").get()?.id))?.logoUrl ?? "";
    expect(logoUrl).toMatch(/^\/shop-logos\/\d+$/);
    expect((await open(storefront(shopId))).html).toContain(`src="${logoUrl}"`);
    expect((await open(sellerHome())).html).toContain(`src="${logoUrl}"`);
    const response = await getLogo(new Request(`http://localhost${logoUrl}`), {
      params: Promise.resolve({ logoId: logoUrl.split("/").at(-1) ?? "" }),
    });
    expect(response.headers.get("content-type")).toBe("image/png");
    expect((await response.arrayBuffer()).byteLength).toBe(Math.floor(1.2 * 1024 * 1024));
  });

  test("SHP-008 ช่องเลือกโลโก้เป็นป้ายภาษาไทยหน้าตาเป็นปุ่ม ซึ่งเปิดช่องเลือกไฟล์ได้เองโดยไม่ต้องมี JavaScript", async () => {
    const { shopId } = await somchaiOpensShop();
    const before = (await open(settings())).html ?? "";

    expect(before).toMatch(/<input id="field-logo" type="file"[^>]*class="visually-hidden" name="logo"/);
    expect(before).toMatch(/<label for="field-logo" class="button button-secondary [^"]*">เลือกรูป<\/label>/);
    expect(before).not.toContain("ลบโลโก้");

    await submit(saveShopSettingsAction(form({ ...somchaiForm, shopId: String(shopId) }, pngFile(1000))));
    const after = (await open(settings())).html ?? "";
    expect(after).toMatch(/<label for="field-logo"[^>]*>เปลี่ยนรูป<\/label>/);
    expect(after).toMatch(/<button type="button" class="link-action">ลบโลโก้<\/button>/);
  });

  test("SHP-008 กด ลบโลโก้ แล้วบันทึก กลับไปใช้ตัวอักษร", async () => {
    const { shopId } = await somchaiOpensShop();
    await submit(saveShopSettingsAction(form({ ...somchaiForm, shopId: String(shopId) }, pngFile(1000))));

    await submit(saveShopSettingsAction(form({ ...somchaiForm, shopId: String(shopId), removeLogo: "1" })));

    expect((await open(storefront(shopId))).html).toMatch(/role="img"[^>]*>ร<\/span>/);
  });

  test("SHP-008 รูป JPG 5 MB หรือไฟล์ PDF ถูกปฏิเสธ โลโก้เดิมยังแสดงอยู่", async () => {
    const { accountId, shopId } = await somchaiOpensShop();
    await submit(saveShopSettingsAction(form({ ...somchaiForm, shopId: String(shopId) }, pngFile(1000))));
    const before = getShopSettings(db, accountId)?.logoUrl;
    const pdf = new File(["%PDF-1.7"], "menu.pdf", { type: "application/pdf" });

    expect(logoFileError({ type: "image/jpeg", size: 5 * 1024 * 1024 })).toBe("ใช้ได้เฉพาะรูป JPG หรือ PNG ขนาดไม่เกิน 2 MB");
    expect(logoFileError(pdf)).toBe("ใช้ได้เฉพาะรูป JPG หรือ PNG ขนาดไม่เกิน 2 MB");
    expect(logoFileError({ type: "image/png", size: 1.2 * 1024 * 1024 })).toBeNull();
    expect((await submit(saveShopSettingsAction(form({ ...somchaiForm, shopId: String(shopId) }, pdf)))).state).toEqual({
      errors: { logo: "ใช้ได้เฉพาะรูป JPG หรือ PNG ขนาดไม่เกิน 2 MB" },
    });
    expect(getShopSettings(db, accountId)?.logoUrl).toBe(before);
  });

  test("SHP-008 ส่งรูปไม่จบ เห็นข้อความ อัปโหลดรูปไม่สำเร็จ ลองใหม่อีกครั้ง", () => {
    expect(formMessage("settings", { failed: true }, true)).toBe("อัปโหลดรูปไม่สำเร็จ ลองใหม่อีกครั้ง");
    expect(formMessage("open", { failed: true }, true)).toBe("อัปโหลดรูปไม่สำเร็จ ลองใหม่อีกครั้ง");
  });
});

describe("SHP-009 แก้ที่อยู่ต้นทาง", () => {
  test("SHP-009 บันทึกที่อยู่ใหม่ หน้าร้านแสดงจังหวัดเป็น เชียงใหม่", async () => {
    const { shopId } = await somchaiOpensShop();
    const chiangMai = { address: "12 ถนนนิมมานเหมินท์", subdistrict: "สุเทพ", district: "เมืองเชียงใหม่", province: "เชียงใหม่", postcode: "50200" };

    expect(await submit(saveShopSettingsAction(form({ ...somchaiForm, ...chiangMai, shopId: String(shopId) })))).toEqual({
      redirect: "/seller/settings?saved=1",
    });
    expect(text((await open(storefront(shopId))).html)).toContain("เชียงใหม่");
  });

  test("SHP-009 ลบเบอร์โทรจนว่าง เห็นข้อความเบอร์โทร และที่อยู่เดิมยังใช้อยู่", async () => {
    const { accountId, shopId } = await somchaiOpensShop();

    const result = await submit(saveShopSettingsAction(form({ ...somchaiForm, shopId: String(shopId), phone: "" })));

    expect(result.state).toEqual({ errors: { phone: "เบอร์โทรต้องเป็นตัวเลข 10 หลัก ขึ้นต้นด้วย 0" } });
    expect(getShopSettings(db, accountId)?.phone).toBe("0812345678");
  });
});

describe("SHP-010 ออกจากฟอร์มกลางทาง", () => {
  const click = (href: string | null, extra: Partial<{ button: number; modified: boolean; target: string }> = {}) =>
    guardedHref({ button: 0, modified: false, target: "", href, ...extra }, "http://localhost:3100");

  test("SHP-010 กด ยกเลิก หรือลิงก์ในเว็บตอนมีข้อมูลค้าง ถูกถามก่อนออก ด้วยปุ่ม อยู่ต่อ และ ออก", async () => {
    await somchaiOpensShop();
    const { html = "" } = await open(settings());

    expect(click("/seller")).toBe("/seller");
    expect(click("/")).toBe("/");
    expect(click("http://localhost:3100/shops/1?x=1")).toBe("/shops/1?x=1");
    expect(html).toContain("ยังไม่ได้บันทึก ต้องการออกจากหน้านี้ไหม");
    expect(html).toMatch(/<button type="button" class="button">อยู่ต่อ<\/button>/);
    expect(html).toContain(">ออก</button>");
    expect(html).toMatch(/<a class="button button-secondary" href="\/seller">ยกเลิก<\/a>/);
  });

  test("SHP-010 ออกจากหน้าเปิดร้านแล้ว ไม่มีร้านถูกสร้าง ยังเห็นเมนูเปิดร้าน และฟอร์มว่างเมื่อเปิดใหม่", async () => {
    signInAs(addAccount(db).id);

    expect(click("/", { target: "_blank" })).toBeNull();
    expect(click("/", { modified: true })).toBeNull();
    expect(click("https://example.com/")).toBeNull();
    expect(shopCount()).toBe(0);
    expect(await header()).toContain('href="/open-shop"');
    const { html = "" } = await open(OpenShopPage());
    expect(html).not.toMatch(/<input[^>]*name="(name|senderName|phone|address|subdistrict|district|postcode)"[^>]*value="[^"]/);
    expect(selectedOption(html)).toBe("เลือกจังหวัด");
  });
});

describe("SHP-011 หน้าร้าน", () => {
  const minute = (n: number) => new Date(Date.UTC(2026, 10, 24, 3, n)).toISOString();

  function somchaiShopWith(count: number) {
    const owner = addAccount(db);
    const shop = addShop(db, { ownerAccountId: owner.id, name: "ร้านสมชายผ้าไทย", openedAt: "2026-11-24T02:00:00.000Z" });
    const ids = Array.from(
      { length: count },
      (_, n) => addProduct(db, { shopId: shop.id, name: `ผ้าไหม ${n + 1}`, price: 290, stock: n === 22 ? 0 : 5, createdAt: minute(n), publishedAt: minute(n) }).id,
    );
    return { ownerId: owner.id, shopId: shop.id, ids };
  }

  test("SHP-011 คนที่ยังไม่เข้าสู่ระบบเห็นข้อมูลร้าน สินค้า 20 ชิ้นแรก ป้ายสินค้าหมด และกดดูเพิ่มได้อีก 3 ชิ้น", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-26T12:00:00+07:00") });
    const { shopId, ids } = somchaiShopWith(23);

    const { html = "" } = await open(storefront(shopId));

    expect(text(html)).toContain("ร้านสมชายผ้าไทย");
    expect(html).toContain("ร้านนี้ยังไม่มีคำอธิบาย");
    expect(html).toContain("กรุงเทพมหานคร");
    expect(text(html)).toContain("เปิดร้านเมื่อ 24 พ.ย.");
    expect(html).toContain('dateTime="2026-11-24T02:00:00.000Z"');
    expect(html).toContain("สินค้า 23 ชิ้น");
    expect(html.match(/href="\/products\/\d+"/g)).toHaveLength(20);
    expect(html.indexOf(`/products/${ids[22]}"`)).toBeLessThan(html.indexOf(`/products/${ids[21]}"`));
    expect(html).toContain("สินค้าหมด");
    expect(html).toContain("฿290");
    expect(html).toContain(">ดูเพิ่ม</button>");
    expect(html).not.toContain("แก้ไขร้าน");

    const shown = { ...listStorefrontProducts(db, shopId), failed: false };
    const more = await showMore(shown, (after) => loadMoreShopProductsAction(shopId, after));
    expect(more.items).toHaveLength(23);
    expect(more.next).toBeNull();
  });

  test("SHP-011 เจ้าของร้านเห็นปุ่ม แก้ไขร้าน ที่พาไปหน้าตั้งค่าร้าน", async () => {
    const { ownerId, shopId } = somchaiShopWith(1);
    signInAs(ownerId);

    expect((await open(storefront(shopId))).html).toMatch(/href="\/seller\/settings">แก้ไขร้าน<\/a>/);
    signInAs(addAccount(db).id);
    expect((await open(storefront(shopId))).html).not.toContain("แก้ไขร้าน");
  });

  test("SHP-011 กดดูเพิ่มแล้วโหลดไม่สำเร็จ สินค้า 20 ชิ้นแรกยังอยู่ และบอกให้ลองใหม่", async () => {
    const { shopId } = somchaiShopWith(23);
    const shown = { ...listStorefrontProducts(db, shopId), failed: false };

    const failed = await showMore(shown, async () => {
      throw new Error("เน็ตหลุด");
    });
    const timedOut = await showMore(shown, () => new Promise(() => {}), 5);

    for (const result of [failed, timedOut]) {
      expect(result.failed).toBe(true);
      expect(result.items).toHaveLength(20);
      expect(result.next).toEqual(shown.next);
    }
    expect((await showMore(failed, (after) => loadMoreShopProductsAction(shopId, after))).items).toHaveLength(23);
    const source = readFileSync(join(process.cwd(), "src/features/shop/components/storefront-products.tsx"), "utf8");
    expect(source).toContain("โหลดสินค้าเพิ่มไม่สำเร็จ");
  });

  test("SHP-011 ดูเพิ่มด้วยค่าที่ปลอมมา ไม่ได้สินค้าเพิ่ม", async () => {
    const { shopId } = somchaiShopWith(23);

    expect(await loadMoreShopProductsAction(shopId, { publishedAt: 1, id: "x" } as never)).toEqual({ items: [], next: null });
    expect(await loadMoreShopProductsAction("1 OR 1=1" as never, { publishedAt: minute(59), id: 1 })).toEqual({ items: [], next: null });
  });
});

describe("SHP-012 หน้าร้านที่ไม่มีสินค้า และร้านที่ไม่มีอยู่", () => {
  test("SHP-012 ร้านที่ยังไม่มีสินค้า แสดง ร้านนี้ยังไม่มีสินค้า และเจ้าของเห็นปุ่ม ลงสินค้าชิ้นแรก เพิ่ม", async () => {
    const { shopId } = await somchaiOpensShop();
    const owner = (await open(storefront(shopId))).html ?? "";
    request.cookies.clear();
    const visitor = (await open(storefront(shopId))).html ?? "";

    for (const html of [owner, visitor]) {
      expect(html).toContain("ร้านสมชายผ้าไทย");
      expect(html).toContain("สินค้า 0 ชิ้น");
      expect(html).toContain("ร้านนี้ยังไม่มีสินค้า");
    }
    expect(owner).toMatch(/href="\/seller\/products\/new">ลงสินค้าชิ้นแรก/);
    expect(owner).not.toContain("ดูสินค้าจากร้านอื่น");
    expect(visitor).not.toContain("ลงสินค้าชิ้นแรก");
    expect(visitor).toMatch(/<a class="button" href="\/">ดูสินค้าจากร้านอื่น<\/a>/);
  });

  test("SHP-012 ลิงก์ที่ไม่ตรงกับร้านใดเลย ได้หน้า ไม่พบร้านนี้ พร้อมปุ่มกลับหน้าแรก", async () => {
    addShop(db, { name: "ร้านที่มีอยู่" });

    for (const shopId of ["9999", "abc", "1.5"]) expect(await open(storefront(shopId))).toEqual({ redirect: "not-found" });
    const html = renderToStaticMarkup(<ShopNotFound />);
    expect(html).toContain("ไม่พบร้านนี้");
    expect(html).toMatch(/href="\/"[^>]*>กลับหน้าแรก/);
    expect(html).not.toContain("ร้านที่มีอยู่");
  });
});

describe("SHP-013 สถานะกำลังโหลดและโหลดไม่สำเร็จ", () => {
  test("SHP-013 ระหว่างโหลด เห็นโครงหน้าพร้อมตัวบอกว่ากำลังโหลด ปุ่มบันทึกและเปิดร้านกดไม่ได้ และไม่มีฟอร์มว่าง", async () => {
    const settingsHtml = renderToStaticMarkup(<SettingsLoading />);
    const openHtml = renderToStaticMarkup(<OpenShopLoading />);
    const storefrontHtml = renderToStaticMarkup(<StorefrontLoading />);

    expect(settingsHtml).toMatch(/<button type="button" class="button" disabled="">บันทึก<\/button>/);
    expect(openHtml).toMatch(/<button type="button" class="button" disabled="">เปิดร้าน<\/button>/);
    for (const html of [settingsHtml, openHtml, storefrontHtml]) {
      expect(html).toContain('role="status"');
      expect(html).not.toContain("<input");
    }
    // ก่อนหน้าโหลดเสร็จ ปุ่มของฟอร์มจริงยังกดไม่ได้
    await somchaiOpensShop();
    expect((await open(settings())).html).toMatch(/<button type="submit" class="button" disabled="">บันทึก<\/button>/);
  });

  test("SHP-013 โหลดไม่สำเร็จ เห็นข้อความ โหลดข้อมูลไม่สำเร็จ พร้อมปุ่ม ลองใหม่", async () => {
    const { shopId } = await somchaiOpensShop();
    db.close();

    await expect(open(storefront(shopId))).rejects.toThrow();
    const html = renderToStaticMarkup(<ErrorPage error={new Error("ล่ม")} retry={() => {}} />);
    expect(html).toContain("โหลดข้อมูลไม่สำเร็จ");
    expect(html).toContain(">ลองใหม่</button>");
  });
});

describe("SHP-014 ร้านที่ถูกระงับ", () => {
  test("SHP-014 ผู้ซื้อเห็นชื่อร้าน โลโก้ และข้อความร้านถูกระงับ ไม่มีสินค้า ส่วนเจ้าของเห็นแถบในหลังบ้าน", async () => {
    const { shopId } = await somchaiOpensShop();
    for (let i = 0; i < 23; i++) addProduct(db, { shopId, price: 100 });
    db.prepare("UPDATE shops SET status = ? WHERE id = ?").run(SHOP_STATUS.suspended, shopId);

    const owner = text((await open(sellerHome())).html);
    const banner = (await open(layout())).html ?? "";
    request.cookies.clear();
    const { html = "" } = await open(storefront(shopId));

    expect(text(html)).toContain("ร้านสมชายผ้าไทย");
    expect(html).toContain('aria-label="โลโก้ร้าน ร้านสมชายผ้าไทย"');
    expect(html).toContain("ร้านนี้ถูกระงับ ซื้อสินค้าจากร้านนี้ไม่ได้ในขณะนี้");
    expect(html).toMatch(/href="\/">ดูสินค้าจากร้านอื่น/);
    expect(html).not.toMatch(/href="\/products\//);
    expect(banner).toContain("ร้านของคุณถูกระงับโดยผู้ดูแลแพลตฟอร์ม");
    expect(owner).toContain(`สถานะร้าน ${SHOP_STATUS.suspended}`);
  });

  test("SHP-014 ร้านถูกระงับแล้วกดบันทึก เห็นข้อความแก้ไม่ได้ ชื่อเดิมยังอยู่ และหน้าตั้งค่าอ่านได้อย่างเดียว", async () => {
    const { accountId, shopId } = await somchaiOpensShop();
    db.prepare("UPDATE shops SET status = ? WHERE id = ?").run(SHOP_STATUS.suspended, shopId);

    const result = await submit(saveShopSettingsAction(form({ ...somchaiForm, shopId: String(shopId), name: "สมชายผ้าไทยใหม่" })));

    expect(result.state).toEqual({ errors: {}, notice: "suspended" });
    expect(formMessage("settings", { errors: {}, notice: "suspended" }, false)).toBe("ร้านถูกระงับ แก้การตั้งค่าร้านไม่ได้");
    expect(getShopSettings(db, accountId)?.name).toBe("ร้านสมชายผ้าไทย");
    const { html = "" } = await open(settings());
    expect(html.match(/<fieldset disabled=""/g)).toHaveLength(2);
    expect(html).not.toContain('type="submit"');
  });
});

describe("SHP-015 เฉพาะเจ้าของร้านเข้าหลังบ้านและแก้ร้านได้", () => {
  test("SHP-015 เจ้าของร้านเปิดหน้าตั้งค่าร้าน เห็นชื่อ คำอธิบาย โลโก้ และที่อยู่ต้นทางครบ 7 ช่อง", async () => {
    await somchaiOpensShop({ description: "ผ้าไหมทอมือ" });
    const { html = "" } = await open(settings());

    for (const value of Object.values(somchaiForm).filter(Boolean)) expect(html).toContain(value);
    expect(html).toContain("ผ้าไหมทอมือ");
    expect(html).toContain('name="logo"');
    expect(selectedOption(html)).toBe("กรุงเทพมหานคร");
  });

  test("SHP-015 วิชัยเปิดหน้าตั้งค่าหรือส่งคำขอแก้ร้านของสมชาย ไม่เห็นข้อมูลของสมชาย และชื่อร้านไม่เปลี่ยน", async () => {
    const somchai = await somchaiOpensShop();
    const wichai = addAccount(db);
    signInAs(wichai.id);
    await submit(openShopAction(form({ ...somchaiForm, name: "ร้านวิชัยผ้าไทย", phone: "0899999999", address: "1 ถนนวิชัย" })));

    const { html = "" } = await open(settings({ shopId: String(somchai.shopId) }));
    const result = await submit(saveShopSettingsAction(form({ ...somchaiForm, shopId: String(somchai.shopId), name: "ร้านของวิชัย" })));

    expect(html).toContain("ร้านวิชัยผ้าไทย");
    expect(html).not.toContain("0812345678");
    expect(html).not.toContain("99/1 ถนนสุขุมวิท");
    expect(result.state).toEqual({ errors: {}, notice: "not-found" });
    expect(formMessage("settings", { errors: {}, notice: "not-found" }, false)).toBe("ไม่พบหน้านี้");
    expect(getShopSettings(db, somchai.accountId)?.name).toBe("ร้านสมชายผ้าไทย");
    expect(renderToStaticMarkup(<SellerNotFound />)).toContain("ไม่พบหน้านี้");
  });

  test("SHP-015 การเข้าสู่ระบบหมดอายุแล้วกดบันทึก ถูกพาไปเข้าสู่ระบบพร้อมข้อความ และคำอธิบายยังเป็นค่าเดิม", async () => {
    const { accountId, shopId } = await somchaiOpensShop();
    signInAs(accountId, new Date(Date.now() - 31 * 24 * 60 * 60 * 1000));

    const result = await submit(saveShopSettingsAction(form({ ...somchaiForm, shopId: String(shopId), description: "ใหม่" })));

    expect(result).toEqual({ redirect: "/login?next=%2Fseller%2Fsettings&notice=relogin" });
    expect(getShopSettings(db, accountId)?.description).toBe("");
  });
});

describe("SHP-Q03 ใช้ง่าย", () => {
  test("SHP-Q03 จากเมนู เปิดร้าน กรอก 8 ช่องแล้วกดปุ่มเดียว ก็ถึงหน้าแรกของหลังบ้าน", async () => {
    signInAs(addAccount(db).id);
    expect(await header()).toMatch(/href="\/open-shop"[^>]*>เปิดร้าน/);
    const { html = "" } = await open(OpenShopPage());

    expect(html.match(/<button type="submit"/g)).toHaveLength(1);
    expect(await submit(openShopAction(form(somchaiForm)))).toEqual({ redirect: "/seller?notice=opened" });
    expect((await open(sellerHome({ notice: "opened" }))).html).toContain("เปิดร้านสำเร็จ");
  });

  test("SHP-Q03 ทุกช่องมีป้ายชื่อ และช่องที่ไม่บังคับบอกไว้", async () => {
    signInAs(addAccount(db).id);
    const { html = "" } = await open(OpenShopPage());

    for (const [, id] of html.matchAll(/<(?:input|select|textarea)[^>]*id="([\w-]+)"/g)) expect(html).toContain(`for="${id}"`);
    expect(html).toContain("คำอธิบายร้าน (ไม่บังคับ)");
    expect(html).toContain("โลโก้ร้าน (ไม่บังคับ)");
  });
});

describe("SHP-Q04 ใช้บนมือถือ", () => {
  test("SHP-Q04 สไตล์ของ feature นี้ไม่มีความกว้างตายตัวที่เกินจอ 360 จุด", () => {
    const css = readFileSync(join(process.cwd(), "src/features/shop/components/shop.module.css"), "utf8");
    // นับเฉพาะ width และ min-width ที่ตั้งให้กล่อง ไม่นับเงื่อนไขของ @media
    const fixed = [...css.matchAll(/(?:^|[\s;{])(?:min-)?width:\s*(\d+)px/g)].map((match) => Number(match[1]));
    expect(fixed.filter((px) => px > 328)).toEqual([]);
  });

  test("SHP-Q04 ทั้ง 4 หน้า ทุกช่องกรอกใช้สไตล์ช่องกรอก และทุกปุ่มใช้สไตล์ที่สูง 44 จุด", async () => {
    const { shopId } = await somchaiOpensShop();
    for (let i = 0; i < 21; i++) addProduct(db, { shopId, price: 100 });
    const pages = [(await open(sellerHome())).html ?? "", (await open(settings())).html ?? "", (await open(storefront(shopId))).html ?? ""];
    signInAs(addAccount(db).id);
    pages.push((await open(OpenShopPage())).html ?? "");

    for (const html of pages) {
      expect(html).toBeTruthy();
      for (const input of html.match(/<(input|select|textarea) [^>]*>/g) ?? []) {
        if (input.includes('type="hidden"')) continue;
        // ช่องเลือกไฟล์ซ่อนไว้ ป้ายที่หน้าตาเป็นปุ่มเปิดแทน
        if (input.includes('type="file"')) expect(input).toContain('class="visually-hidden"');
        else expect(input).toContain('class="input"');
      }
      for (const button of html.match(/<button [^>]*>/g) ?? []) expect(button).toMatch(/class="(button|link-action)/);
    }
  });
});

describe("SHP-Q05 ข้อมูลส่วนตัวของผู้ขาย", () => {
  const privateValues = ["สมชาย ใจดี", "0812345678", "99/1 ถนนสุขุมวิท", "คลองเตย", "10110"];

  test("SHP-Q05 คนที่ยังไม่เข้าสู่ระบบ เปิดหน้าร้านและกดดูเพิ่ม ไม่ได้รับชื่อผู้ส่ง เบอร์โทร และที่อยู่ส่วนอื่น", async () => {
    const { shopId } = await somchaiOpensShop();
    for (let i = 0; i < 25; i++) addProduct(db, { shopId, price: 100 });
    request.cookies.clear();

    const { html = "" } = await open(storefront(shopId));
    const first = listStorefrontProducts(db, shopId);
    const more = JSON.stringify(await loadMoreShopProductsAction(shopId, first.next!));

    expect(html).toContain("กรุงเทพมหานคร");
    for (const value of privateValues) {
      expect(html).not.toContain(value);
      expect(more).not.toContain(value);
    }
  });

  test("SHP-Q05 บัญชีอื่นที่เข้าสู่ระบบอยู่ เปิดหน้าร้านของร้านตัวอย่างหลายร้าน ไม่เห็นข้อมูลส่วนตัวของร้านใด", async () => {
    await somchaiOpensShop();
    const shops = [db.prepare("SELECT id FROM shops").get()?.id as number];
    for (let i = 0; i < 5; i++) shops.push(addShop(db, { origin: { name: "มานี ส่งไว", phone: "0823456789", address: "7 ซอยลับ", subdistrict: "ศรีภูมิ", district: "เมืองเชียงใหม่", province: "เชียงใหม่", postcode: "50200" } }).id);
    signInAs(addAccount(db).id);

    for (const shopId of shops) {
      const { html = "" } = await open(storefront(shopId));
      for (const value of [...privateValues, "มานี ส่งไว", "0823456789", "7 ซอยลับ", "ศรีภูมิ", "50200"]) expect(html).not.toContain(value);
    }
  });
});
