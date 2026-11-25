// test ระดับหน้าและ server action ของที่อยู่จัดส่ง ส่วน vi.mock ลอกมาจาก src/features/account/account-pages.test.tsx

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import EditAddressPage from "@/app/addresses/[addressId]/page";
import AddressesError from "@/app/addresses/error";
import NewAddressPage from "@/app/addresses/new/page";
import AddressesPage from "@/app/addresses/page";
import { createSession } from "@/features/account/server/sessions";
import { deleteAddressAction, saveAddressAction, setDefaultAddressAction } from "@/features/checkout/address-actions";
import { ADDRESS_LIMIT, createAddress, deleteAddress, getAddress, listAddresses, type AddressInput } from "@/features/checkout/server/addresses";
import type { Db } from "@/shared/db";
import { addAccount } from "@/shared/db/builders";
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

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

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

async function open(page: Promise<React.ReactNode>): Promise<{ redirect?: string; html?: string }> {
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

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
};

const props = (searchParams: Record<string, string> = {}) => ({
  params: Promise.resolve({}),
  searchParams: Promise.resolve(searchParams),
});

const editProps = (addressId: string) => ({ params: Promise.resolve({ addressId }), searchParams: Promise.resolve({}) });

function signInAs(accountId: number): void {
  request.cookies.set(SESSION_COOKIE, createSession(db, accountId));
}

const at = (time: string) => new Date(`2026-11-24T${time}:00+07:00`);

const somying: AddressInput = {
  recipientName: "สมหญิง ใจดี",
  phone: "0812345678",
  address: "99/1 ถนนนิมมานเหมินท์",
  subdistrict: "สุเทพ",
  district: "เมืองเชียงใหม่",
  province: "เชียงใหม่",
  postcode: "50200",
};

function add(accountId: number, address: string, time: string, extra: Partial<AddressInput> = {}): number {
  const result = createAddress(db, accountId, { ...somying, address, ...extra }, at(time));
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.id;
}

const BADGE = ">ที่อยู่หลัก</span>";

/** HTML ของแต่ละการ์ดที่อยู่ เรียงตามที่แสดง */
const cards = (html = "") => html.split("<li").slice(1);

async function listPage(searchParams: Record<string, string> = {}): Promise<string> {
  const { html, redirect } = await open(AddressesPage(props(searchParams)));
  if (!html) throw new Error(`ถูกพาไป ${redirect}`);
  return html;
}

function signedInSomchai() {
  const somchai = addAccount(db, { displayName: "สมชาย" }).id;
  signInAs(somchai);
  const home = add(somchai, "บ้าน", "08:00", { recipientName: "สมชาย ใจดี", phone: "0811111111" });
  const work = add(somchai, "ที่ทำงาน", "09:00", { province: "กรุงเทพมหานคร" });
  return { somchai, home, work };
}

describe("CHK-001 หน้ารายการที่อยู่จัดส่ง", () => {
  test("CHK-001 ที่อยู่หลักอยู่บนสุดพร้อมป้าย แต่ละแห่งมีชื่อผู้รับ เบอร์โทร ที่อยู่เต็ม และปุ่มจัดการ", async () => {
    const { home, work } = signedInSomchai();
    const [first, second] = cards(await listPage());

    expect(first).toContain(BADGE);
    expect(first).toContain("สมชาย ใจดี");
    expect(first).toContain("0811111111");
    expect(first).toContain("บ้าน สุเทพ เมืองเชียงใหม่ เชียงใหม่ 50200");
    expect(first).toContain(`href="/addresses/${home}"`);
    expect(first).toContain("ลบ");
    expect(second).not.toContain(BADGE);
    expect(second).toContain("ที่ทำงาน");
    expect(second).toContain(`href="/addresses/${work}"`);
    expect(second).toContain("ตั้งเป็นที่อยู่หลัก");
  });

  test("CHK-001 แถบด้านบนมีลิงก์ไปหน้าที่อยู่จัดส่งเมื่อเข้าสู่ระบบแล้ว", async () => {
    expect(renderToStaticMarkup(await SiteHeader())).not.toContain('href="/addresses"');
    signInAs(addAccount(db).id);
    expect(renderToStaticMarkup(await SiteHeader())).toContain('href="/addresses"');
  });

  test("CHK-001 ยังไม่มีที่อยู่ เห็นข้อความหน้าว่างและปุ่มเพิ่มที่อยู่", async () => {
    signInAs(addAccount(db).id);
    const html = await listPage();

    expect(html).toContain("ยังไม่มีที่อยู่จัดส่ง");
    expect(html).toMatch(/href="\/addresses\/new"[^>]*>เพิ่มที่อยู่/);
    expect(cards(html)).toHaveLength(0);
  });

  test("CHK-001 โหลดไม่สำเร็จ เห็นข้อความและปุ่มลองใหม่ ที่อยู่ยังอยู่ครบเมื่อโหลดได้อีกครั้ง", async () => {
    const { somchai } = signedInSomchai();
    const html = renderToStaticMarkup(<AddressesError error={new Error("เน็ตหลุด")} retry={() => {}} />);

    expect(html).toContain("โหลดที่อยู่ไม่สำเร็จ");
    expect(html).toContain("ลองใหม่");
    expect(listAddresses(db, somchai)).toHaveLength(2);
    expect(cards(await listPage())).toHaveLength(2);
  });

  test("CHK-001 ยังไม่เข้าสู่ระบบ ถูกพาไปหน้าเข้าสู่ระบบแล้วกลับมาที่หน้านี้", async () => {
    expect(await open(AddressesPage(props()))).toEqual({ redirect: "/login?next=%2Faddresses" });
  });
});

describe("CHK-002 เพิ่มและแก้ที่อยู่จัดส่งผ่านหน้าเว็บ", () => {
  test("CHK-002 บันทึกที่อยู่แห่งแรก เห็นข้อความบันทึกแล้วและที่อยู่นั้นมีป้ายที่อยู่หลัก", async () => {
    const account = addAccount(db).id;
    signInAs(account);

    const result = await submit(saveAddressAction(form({ ...somying })));
    expect(result.redirect).toBe("/addresses?notice=saved");

    const html = await listPage({ notice: "saved" });
    expect(html).toContain("บันทึกที่อยู่แล้ว");
    expect(cards(html)).toHaveLength(1);
    expect(cards(html)[0]).toContain(BADGE);
  });

  test("CHK-002 ข้อมูลไม่ครบ ไม่บันทึก ได้ข้อความใต้ช่องเบอร์โทรและรหัสไปรษณีย์", async () => {
    const account = addAccount(db).id;
    signInAs(account);

    const result = await submit(saveAddressAction(form({ ...somying, phone: "08123", postcode: "" })));
    expect(result.state).toEqual({
      errors: {
        phone: "เบอร์โทรต้องเป็นตัวเลข 10 หลัก ขึ้นต้นด้วย 0",
        postcode: "กรุณากรอกรหัสไปรษณีย์ 5 หลัก",
      },
    });
    expect(listAddresses(db, account)).toEqual([]);
  });

  test("CHK-002 แบบกรอกมีครบ 7 ช่อง จังหวัดเลือกจาก 77 จังหวัด และปุ่มยกเลิกกลับหน้ารายการ", async () => {
    signInAs(addAccount(db).id);
    const { html } = await open(NewAddressPage(props()));

    for (const name of ["recipientName", "phone", "address", "subdistrict", "district", "province", "postcode"]) {
      expect(html).toContain(`name="${name}"`);
    }
    expect(html?.match(/<option/g)).toHaveLength(78);
    expect(html).toMatch(/href="\/addresses"[^>]*>ยกเลิก/);
  });

  test("CHK-002 ที่อยู่ครบ 10 แห่ง เปิดหน้าเพิ่มหรือกดบันทึก เห็นข้อความเกินจำนวน", async () => {
    const account = addAccount(db).id;
    signInAs(account);
    for (let i = 1; i <= 10; i++) add(account, `ที่อยู่ ${i}`, `13:${String(i).padStart(2, "0")}`);

    expect((await open(NewAddressPage(props()))).html).toContain(ADDRESS_LIMIT);
    const result = await submit(saveAddressAction(form({ ...somying, address: "อีกแห่ง" })));
    expect(result.state).toEqual({ errors: { form: ADDRESS_LIMIT } });
    expect(listAddresses(db, account)).toHaveLength(10);
  });

  test("CHK-002 แก้เบอร์โทรจากหน้าแก้ไข แล้วรายการแสดงเบอร์ใหม่", async () => {
    const { somchai, work } = signedInSomchai();
    const { html } = await open(EditAddressPage(editProps(String(work))));
    expect(html).toContain('value="0812345678"');

    const result = await submit(
      saveAddressAction(form({ ...somying, address: "ที่ทำงาน", province: "กรุงเทพมหานคร", phone: "0893334444", addressId: String(work) })),
    );
    expect(result.redirect).toBe("/addresses?notice=saved");
    expect(getAddress(db, somchai, work)?.phone).toBe("0893334444");
    expect(await listPage()).toContain("0893334444");
  });

  test("CHK-002 เปิดหน้าแก้ไขที่อยู่ของบัญชีอื่น ได้หน้าไม่พบ", async () => {
    const { work } = signedInSomchai();
    signInAs(addAccount(db).id);

    expect(await open(EditAddressPage(editProps(String(work))))).toEqual({ redirect: "not-found" });
    expect(await open(EditAddressPage(editProps("abc")))).toEqual({ redirect: "not-found" });
  });

  test("CHK-002 เพิ่มจากหน้าสั่งซื้อ บันทึกแล้วกลับไปหน้าสั่งซื้อพร้อมเลขที่อยู่ใหม่ ยกเลิกก็กลับหน้าสั่งซื้อ", async () => {
    const account = addAccount(db).id;
    signInAs(account);

    const { html } = await open(NewAddressPage(props({ next: "/checkout" })));
    expect(html).toContain('name="next" value="/checkout"');
    expect(html).toMatch(/href="\/checkout"[^>]*>ยกเลิก/);

    const result = await submit(saveAddressAction(form({ ...somying, next: "/checkout" })));
    const [saved] = listAddresses(db, account);
    expect(result.redirect).toBe(`/checkout?addressId=${saved.id}`);
  });

  test("CHK-002 next ที่พาออกนอกเว็บ ถูกเปลี่ยนเป็นหน้าแรก", async () => {
    signInAs(addAccount(db).id);
    const result = await submit(saveAddressAction(form({ ...somying, next: "//evil.example.com" })));
    expect(result.redirect).toMatch(/^\/\?addressId=\d+$/);
  });

  test("CHK-002 ออกจากระบบไปแล้วกดบันทึก ไม่บันทึกและถูกพาไปเข้าสู่ระบบ", async () => {
    const result = await submit(saveAddressAction(form({ ...somying, next: "/checkout" })));
    expect(result.redirect).toBe(`/login?${new URLSearchParams({ next: "/addresses/new?next=%2Fcheckout", notice: "relogin" })}`);
    expect(db.prepare("SELECT count(*) AS n FROM shipping_addresses").get()).toEqual({ n: 0 });
  });
});

describe("CHK-003 ลบที่อยู่และตั้งที่อยู่หลักผ่านหน้าเว็บ", () => {
  test("CHK-003 ตั้งที่อยู่หลักแล้วป้ายย้าย", async () => {
    const { work } = signedInSomchai();

    expect((await submit(setDefaultAddressAction(form({ addressId: String(work) })))).redirect).toBe("/addresses");
    const [first, second] = cards(await listPage());
    expect(first).toContain("ที่ทำงาน");
    expect(first).toContain(BADGE);
    expect(second).not.toContain(BADGE);
  });

  test("CHK-003 กดลบแล้วต้องยืนยันก่อน ยืนยันแล้วที่อยู่หายจากรายการ", async () => {
    const { somchai, home } = signedInSomchai();

    const confirming = cards(await listPage({ delete: String(home) }))[0];
    expect(confirming).toMatch(/class="button button-secondary"[^>]*>ยืนยันลบ/);
    expect(confirming).toMatch(/href="\/addresses"[^>]*>ไม่ลบ/);
    expect(listAddresses(db, somchai)).toHaveLength(2);

    expect((await submit(deleteAddressAction(form({ addressId: String(home) })))).redirect).toBe("/addresses?notice=deleted");
    const html = await listPage({ notice: "deleted" });
    expect(html).toContain("ลบที่อยู่แล้ว");
    expect(cards(html)).toHaveLength(1);
    expect(cards(html)[0]).toContain(BADGE);
  });

  test("CHK-003 ตั้งที่อยู่ที่ถูกลบในหน้าต่างอื่นเป็นที่อยู่หลัก เห็นข้อความไม่พบ และที่อยู่หลักยังเป็นแห่งเดิม", async () => {
    const { somchai, home, work } = signedInSomchai();
    const third = add(somchai, "บ้านแม่", "10:00");
    await submit(setDefaultAddressAction(form({ addressId: String(work) })));
    deleteAddress(db, somchai, third);

    const result = await submit(setDefaultAddressAction(form({ addressId: String(third) })));
    expect(result.redirect).toBe("/addresses?notice=gone");
    expect((await submit(deleteAddressAction(form({ addressId: String(third) })))).redirect).toBe("/addresses?notice=gone");

    const html = await listPage({ notice: "gone" });
    expect(html).toContain("ไม่พบที่อยู่นี้แล้ว");
    expect(cards(html)[0]).toContain("ที่ทำงาน");
    expect(cards(html)[0]).toContain(BADGE);
    expect(getAddress(db, somchai, home)?.isDefault).toBe(false);
  });

  test("CHK-003 ออกจากระบบไปแล้วกดลบ ไม่ลบและถูกพาไปเข้าสู่ระบบ", async () => {
    const { somchai, home } = signedInSomchai();
    request.cookies.clear();

    const result = await submit(deleteAddressAction(form({ addressId: String(home) })));
    expect(result.redirect).toBe("/login?next=%2Faddresses&notice=relogin");
    expect(listAddresses(db, somchai)).toHaveLength(2);
  });
});
