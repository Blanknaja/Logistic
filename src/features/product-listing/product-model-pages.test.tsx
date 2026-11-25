// test ระดับหน้า server action และ route ของไฟล์ 3 มิติ ส่วน vi.mock ลอกมาจาก src/features/account/account-pages.test.tsx

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { GET as getModel } from "@/app/product-models/[key]/route";
import { POST as uploadModel } from "@/app/product-models/route";
import EditProductPage from "@/app/seller/products/[productId]/page";
import NewProductPage from "@/app/seller/products/new/page";
import { createSession } from "@/features/account/server/sessions";
import { updateProductAction } from "@/features/product-listing/actions";
import { saveModelFile } from "@/features/product-listing/server/model-files";
import { getProductForEdit } from "@/features/product-listing/server/products";
import { CHAIR_GLB_BYTES, fakeGlb, streamedBody } from "@/features/product-listing/server/testing";
import type { Db } from "@/shared/db";
import { addAccount, addProduct, addShop } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";
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

const MB = 1024 * 1024;
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const count = () => Number(db.prepare("SELECT count(*) AS n FROM product_model_files").get()?.n);
const editPage = (productId: number) =>
  EditProductPage({ params: Promise.resolve({ productId: String(productId) }), searchParams: Promise.resolve({}) } as PageProps<"/seller/products/[productId]">);

/** สมชายเจ้าของ "ร้านสมชาย" เข้าสู่ระบบอยู่ */
function signInSomchai() {
  const account = addAccount(db);
  const shop = addShop(db, { ownerAccountId: account.id, name: "ร้านสมชาย" });
  request.cookies.set(SESSION_COOKIE, createSession(db, account.id));
  return shop.id;
}

const post = (name: string, body: BodyInit) =>
  uploadModel(
    new Request(`http://localhost/product-models?name=${encodeURIComponent(name)}`, { method: "POST", body, duplex: "half" } as RequestInit),
  );

const open3d = (url: string) =>
  getModel(new Request(`http://localhost${url}`), {
    params: Promise.resolve({ key: url.split("/").pop()! }),
  } as RouteContext<"/product-models/[key]">);

describe("P3D-001 ส่งไฟล์ 3 มิติขึ้นและเปิดดูไฟล์", () => {
  test("P3D-001 ผู้ขายส่ง chair.glb ได้ที่อยู่ไฟล์ และเปิดไฟล์นั้นได้เป็นชนิด GLB", async () => {
    signInSomchai();
    const response = await post("chair.glb", fakeGlb(4096));
    expect(response.status).toBe(200);
    const { url } = (await response.json()) as { url: string };

    const file = await open3d(url);
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("model/gltf-binary");
    expect(file.headers.get("x-content-type-options")).toBe("nosniff");
    expect((await file.arrayBuffer()).byteLength).toBe(4096);
  });

  test("P3D-001 รูป JPG ที่ชื่อ photo.glb และไฟล์ที่บอกขนาดเกิน 10 MB ไม่ถูกรับพร้อมเหตุผล", async () => {
    signInSomchai();
    const jpg = new Uint8Array(2048);
    jpg.set([0xff, 0xd8, 0xff, 0xe0]);
    const wrong = await post("photo.glb", jpg);
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toEqual({ error: "ไฟล์ต้องเป็นชนิด GLB" });

    const large = await post("big.glb", fakeGlb(12 * MB));
    expect(large.status).toBeGreaterThanOrEqual(400);
    expect(await large.json()).toEqual({ error: "ไฟล์ 3 มิติต้องมีขนาดไม่เกิน 10 MB" });
    expect(count()).toBe(0);
  });

  test("P3D-001 ไฟล์เกิน 10 MB ที่ส่งมาทีละก้อนโดยไม่บอกขนาด ไม่ถูกรับ และเซิร์ฟเวอร์หยุดอ่านทันทีที่เกิน", async () => {
    signInSomchai();
    const { body, stats } = streamedBody(fakeGlb(30 * MB));
    const response = await post("big.glb", body);

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "ไฟล์ 3 มิติต้องมีขนาดไม่เกิน 10 MB" });
    expect(stats.sent).toBeLessThanOrEqual(12 * MB);
    expect(count()).toBe(0);
  });

  test("P3D-001 ไฟล์ไม่เกิน 10 MB ที่ส่งมาทีละก้อนโดยไม่บอกขนาด ถูกรับครบทุกไบต์", async () => {
    signInSomchai();
    const response = await post("chair.glb", streamedBody(fakeGlb(4 * MB)).body);
    expect(response.status).toBe(200);
    const { url } = (await response.json()) as { url: string };
    expect((await (await open3d(url)).arrayBuffer()).byteLength).toBe(4 * MB);
  });

  test("P3D-001 บัญชีที่ยังไม่มีร้าน หรือยังไม่เข้าสู่ระบบ ส่งไฟล์ไม่ได้ (PRD-012)", async () => {
    expect((await post("chair.glb", fakeGlb())).status).toBe(401);
    request.cookies.set(SESSION_COOKIE, createSession(db, addAccount(db).id));
    expect((await post("chair.glb", fakeGlb())).status).toBe(401);
    expect(count()).toBe(0);
  });

  test("P3D-001 ที่อยู่ไฟล์ที่ไม่มีอยู่ ได้ ไม่พบ", async () => {
    expect((await open3d("/product-models/x")).status).toBe(404);
  });
});

describe("P3D-001 ช่องไฟล์ 3 มิติในหน้าฟอร์ม", () => {
  test("P3D-001 หน้าฟอร์มสินค้าใหม่มีช่อง ไฟล์ 3 มิติ ที่ไม่บังคับ พร้อมข้อความบอกเงื่อนไขไฟล์", async () => {
    signInSomchai();
    const html = (await open(NewProductPage())).html;

    expect(html).toContain("<legend>ไฟล์ 3 มิติ</legend>");
    expect(html).toContain("ไฟล์ .glb ไม่เกิน 10 MB ของในไฟล์ต้องมีขนาดจริง หน่วยเป็นเมตร");
    expect(html).toMatch(/<input type="file" accept="\.glb,model\/gltf-binary"/);
    expect(text(html)).toContain("เลือกไฟล์ 3 มิติ");
    expect(text(html)).not.toContain("เอาออก");
  });

  test("P3D-001 สินค้าที่มีไฟล์แล้ว หน้าฟอร์มแสดงชื่อและขนาดไฟล์ พร้อมปุ่ม เอาออก", async () => {
    const shopId = signInSomchai();
    const product = addProduct(db, { shopId, name: "เก้าอี้ผ้ากำมะหยี่" });
    const saved = saveModelFile(db, shopId, "chair.glb", fakeGlb(CHAIR_GLB_BYTES));
    if (!saved.ok) throw new Error(saved.error);
    db.prepare("UPDATE products SET model_url = ? WHERE id = ?").run(saved.url, product.id);

    const page = text((await open(editPage(product.id))).html);
    expect(page).toContain("chair.glb 3.9 MB");
    expect(page).toContain("เอาออก");
    expect(page).toContain("เปลี่ยนไฟล์ 3 มิติ");
  });
});

describe("P3D-002 บันทึกการเปลี่ยนไฟล์ 3 มิติผ่านหน้าเว็บ", () => {
  test("P3D-002 ใส่ไฟล์แล้วบันทึก เห็นข้อความยืนยัน แล้วกด เอาออก บันทึกอีกครั้ง หน้าฟอร์มไม่มีไฟล์", async () => {
    const shopId = signInSomchai();
    const product = addProduct(db, { shopId, name: "เก้าอี้ผ้ากำมะหยี่" });
    const saved = saveModelFile(db, shopId, "chair.glb", fakeGlb());
    if (!saved.ok) throw new Error(saved.error);
    const form = () => getProductForEdit(db, shopId, product.id)!;

    const added = await submit(updateProductAction(product.id, form().updatedAt, "publish", { ...form().values, model: saved.url }));
    expect(added.redirect).toBe("/seller/products?notice=saved");
    expect(text((await open(editPage(product.id))).html)).toContain("chair.glb");

    const removed = await submit(updateProductAction(product.id, form().updatedAt, "publish", { ...form().values, model: null }));
    expect(removed.redirect).toBe("/seller/products?notice=saved");
    const page = text((await open(editPage(product.id))).html);
    expect(page).not.toContain("chair.glb");
    expect(page).not.toContain("เอาออก");
  });
});
