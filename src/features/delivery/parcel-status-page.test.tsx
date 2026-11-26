// test ของหน้า /parcels/[trackingNo] และ server action ที่หน้านี้ใช้
// ส่วน vi.mock ลอกจาก src/features/account/account-pages.test.tsx

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import ParcelStatusPage from "@/app/parcels/[trackingNo]/page";
import { createSession } from "@/features/account/server/sessions";
import {
  changeParcelStatus,
  createParcelForPaidOrder,
  LOCATION_ERROR,
  NOT_ALLOWED,
  ONE_STEP,
  type StatusChanger,
} from "@/features/delivery/server/parcel-status";
import { changeParcelStatusAction } from "@/features/delivery/status-actions";
import type { Db } from "@/shared/db";
import { addAccount, addOrder, addProduct, addShop } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";
import { PROVINCES } from "@/shared/provinces";
import { SESSION_COOKIE } from "@/shared/session";
import { ORDER_STATUS, PARCEL_STATUS, type ParcelStatus } from "@/shared/statuses";

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

const S = PARCEL_STATUS;
let db: Db;
let somchai: StatusChanger;
let manaId: number;
let wichaiId: number;
let somyingId: number;

beforeEach(() => {
  db = createTestDb();
  request.db = db;
  request.cookies.clear();
  const somchaiId = addAccount(db).id;
  somchai = { id: somchaiId, isAdmin: false, shopId: addShop(db, { ownerAccountId: somchaiId, name: "สมชายการช่าง" }).id };
  manaId = addAccount(db).id;
  addShop(db, { ownerAccountId: manaId, name: "มานะสปอร์ต" });
  wichaiId = addAccount(db, { isAdmin: true }).id;
  somyingId = addAccount(db).id;
});

function signInAs(accountId: number): void {
  request.cookies.set(SESSION_COOKIE, createSession(db, accountId));
}

/** พัสดุของสมหญิงจากร้านสมชาย พาไปถึงสถานะที่ต้องการทีละขั้น */
function parcelAt(status: ParcelStatus) {
  const variantId = addProduct(db, { shopId: somchai.shopId!, name: "ค้อน", price: 150 }).variantIds[0];
  const order = addOrder(db, { buyerAccountId: somyingId, items: [{ variantId, quantity: 2 }], status: ORDER_STATUS.paid });
  const parcel = createParcelForPaidOrder(db, order.id);
  const path = [S.awaitingPacking, S.handedOver, S.inTransit, S.outForDelivery, S.delivered];
  const end = status === S.failed ? 4 : path.indexOf(status);
  for (let i = 1; i <= end; i++) {
    changeParcelStatus(db, {
      trackingNo: parcel.trackingNo,
      actor: somchai,
      from: path[i - 1],
      to: status === S.failed && i === 4 ? S.failed : path[i],
      location: `จุดที่ ${i}`,
      province: "กรุงเทพมหานคร",
      receiverName: "สมหญิง ใจดี",
      reason: "ไม่มีคนรับ",
    });
  }
  return { ...parcel, orderId: order.id };
}

async function open(trackingNo: string, searchParams: Record<string, string> = {}) {
  try {
    const page = await ParcelStatusPage({
      params: Promise.resolve({ trackingNo }),
      searchParams: Promise.resolve(searchParams),
    });
    return { html: renderToStaticMarkup(page) };
  } catch (error) {
    if (error instanceof request.Redirected) return { redirect: error.url };
    throw error;
  }
}

async function submit(values: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  try {
    return { state: await changeParcelStatusAction(data) };
  } catch (error) {
    if (error instanceof request.Redirected) return { redirect: error.url };
    throw error;
  }
}

const buttons = (html = "") => html.match(/เปลี่ยนเป็น [^<]+/g) ?? [];
const historyCount = (parcelId: number) =>
  (db.prepare("SELECT count(*) AS n FROM parcel_history WHERE parcel_id = ?").get(parcelId) as { n: number }).n;

describe("DLV-002 สิทธิ์เปลี่ยนสถานะการจัดส่ง", () => {
  test("DLV-002 ผู้ดูแลแพลตฟอร์มเปิดหน้าเปลี่ยนสถานะของร้านไหนก็ได้ และบันทึกได้", async () => {
    const parcel = parcelAt(S.awaitingPacking);
    signInAs(wichaiId);

    expect(buttons((await open(parcel.trackingNo)).html)).toEqual(["เปลี่ยนเป็น ร้านส่งของแล้ว"]);
    const result = await submit({
      trackingNo: parcel.trackingNo,
      from: S.awaitingPacking,
      to: S.handedOver,
      location: "จุดรับพัสดุบางนา",
      province: "กรุงเทพมหานคร",
    });
    expect(result.redirect).toBe(`/parcels/${parcel.trackingNo}?saved=1`);
    expect(historyCount(parcel.id)).toBe(2);
  });

  test("DLV-002 ผู้ขายร้านอื่นและผู้ซื้อ เปิดหน้าได้ ไม่พบพัสดุนี้ และส่งคำขอไปก็ถูกปฏิเสธ", async () => {
    const parcel = parcelAt(S.awaitingPacking);

    for (const accountId of [manaId, somyingId]) {
      signInAs(accountId);
      expect(await open(parcel.trackingNo)).toEqual({ redirect: "not-found" });
      const result = await submit({
        trackingNo: parcel.trackingNo,
        from: S.awaitingPacking,
        to: S.handedOver,
        location: "จุดรับพัสดุบางนา",
        province: "กรุงเทพมหานคร",
      });
      expect(result.state?.error).toBe(NOT_ALLOWED);
    }
    expect(historyCount(parcel.id)).toBe(1);
  });

  test("DLV-002 ยังไม่เข้าสู่ระบบ ถูกพาไปหน้าเข้าสู่ระบบแล้วกลับมาหน้านี้", async () => {
    const parcel = parcelAt(S.awaitingPacking);

    expect((await open(parcel.trackingNo)).redirect).toBe(`/login?next=${encodeURIComponent(`/parcels/${parcel.trackingNo}`)}`);
    const result = await submit({ trackingNo: parcel.trackingNo, from: S.awaitingPacking, to: S.handedOver, location: "ที่ไหน", province: "กรุงเทพมหานคร" });
    expect(result.redirect).toContain("/login?next=");
    expect(historyCount(parcel.id)).toBe(1);
  });
});

describe("DLV-003 เดินหน้าทีละขั้น ไม่ย้อน ไม่ข้าม", () => {
  test("DLV-003 ร้านส่งของแล้ว มีปุ่มเดียว กำลังนำส่ง มีสองปุ่ม", async () => {
    signInAs(somchai.id);

    expect(buttons((await open(parcelAt(S.handedOver).trackingNo)).html)).toEqual(["เปลี่ยนเป็น อยู่ระหว่างขนส่ง"]);
    expect(buttons((await open(parcelAt(S.outForDelivery).trackingNo)).html)).toEqual([
      "เปลี่ยนเป็น ส่งสำเร็จ",
      "เปลี่ยนเป็น ส่งไม่สำเร็จ",
    ]);
  });

  test("DLV-003 หัวเรื่องคือสถานะตอนนี้ ขั้นถัดไปเป็นปุ่มสีเน้นปุ่มเดียว และไม่มีสถานะคำสั่งซื้อที่อ่านแล้วขัดกัน", async () => {
    const parcel = parcelAt(S.outForDelivery);
    signInAs(somchai.id);

    const { html = "" } = await open(parcel.trackingNo);
    const heading = html.match(/<h1[^>]*>([^]*?)<\/h1>/)?.[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    expect(heading).toBe(`เปลี่ยนสถานะการจัดส่ง ${parcel.trackingNo} ${S.outForDelivery}`);
    expect(html.match(/class="button"/g)).toHaveLength(1);
    expect(html).toMatch(/<a[^>]*class="button"[^>]*>เปลี่ยนเป็น ส่งสำเร็จ<\/a>/);
    expect(html).not.toContain("สถานะคำสั่งซื้อ");
    expect(html).not.toContain(ORDER_STATUS.shipping);

    // เปิดฟอร์มแล้ว ปุ่มสีเน้นคือบันทึก ยกเลิกเป็นลิงก์ข้อความ
    const form = (await open(parcel.trackingNo, { to: S.delivered })).html ?? "";
    expect(form.match(/class="button"/g)).toHaveLength(1);
    expect(form).toMatch(/<button[^>]*class="button"[^>]*>บันทึก<\/button>/);
    expect(form).toMatch(/<a[^>]*class="link-action"[^>]*>ยกเลิก<\/a>/);
  });

  test("DLV-003 ส่งคำขอข้ามขั้นหรือย้อนกลับ ได้ข้อความพร้อมสถานะปัจจุบัน และ ?to= ที่ไม่ใช่ขั้นถัดไปไม่เปิดฟอร์ม", async () => {
    const parcel = parcelAt(S.handedOver);
    signInAs(somchai.id);

    for (const to of [S.delivered, S.awaitingPacking]) {
      const result = await submit({ trackingNo: parcel.trackingNo, from: S.handedOver, to, location: "ที่ไหน", receiverName: "สมหญิง", province: "กรุงเทพมหานคร" });
      expect(result.state).toMatchObject({ error: ONE_STEP, currentStatus: S.handedOver });
    }
    const { html } = await open(parcel.trackingNo, { to: S.delivered });
    expect(html).not.toContain('name="location"');
    expect(historyCount(parcel.id)).toBe(2);
  });
});

describe("DLV-004 บันทึกเวลา สถานที่ และคนเปลี่ยน ทุกครั้ง", () => {
  test("DLV-004 กดเปลี่ยนเป็น กรอกสถานที่ บันทึก แล้วเห็นบันทึกแล้วพร้อมรายการล่าสุด", async () => {
    const parcel = parcelAt(S.handedOver);
    signInAs(somchai.id);

    const form = (await open(parcel.trackingNo, { to: S.inTransit })).html;
    expect(form).toContain("เปลี่ยนเป็น อยู่ระหว่างขนส่ง");
    expect(form).toContain('name="location"');
    expect(form).toContain(`value="${S.handedOver}"`);

    const result = await submit({
      trackingNo: parcel.trackingNo,
      from: S.handedOver,
      to: S.inTransit,
      location: "ศูนย์คัดแยกลาดกระบัง",
      province: "กรุงเทพมหานคร",
    });
    expect(result.redirect).toBe(`/parcels/${parcel.trackingNo}?saved=1`);

    const { html } = await open(parcel.trackingNo, { saved: "1" });
    expect(html).toContain("บันทึกแล้ว");
    expect(html).toContain("ศูนย์คัดแยกลาดกระบัง");
    expect(buttons(html)).toEqual(["เปลี่ยนเป็น กำลังนำส่ง"]);
    expect(historyCount(parcel.id)).toBe(3);
  });

  test("DLV-004 สถานที่ว่าง ได้ข้อความใต้ช่อง และเปิดฟอร์มแล้วปิดโดยไม่บันทึกก็ไม่มีอะไรเปลี่ยน", async () => {
    const parcel = parcelAt(S.handedOver);
    signInAs(somchai.id);

    await open(parcel.trackingNo, { to: S.inTransit });
    const result = await submit({ trackingNo: parcel.trackingNo, from: S.handedOver, to: S.inTransit, location: "     ", province: "กรุงเทพมหานคร" });

    expect(result.state?.fieldErrors).toEqual({ location: LOCATION_ERROR });
    expect(historyCount(parcel.id)).toBe(2);
  });
});

describe("DLV-005 และ DLV-006 ช่องที่ต้องกรอกเพิ่ม", () => {
  test("DLV-005 ฟอร์มส่งสำเร็จมีช่องชื่อผู้รับ", async () => {
    signInAs(somchai.id);
    const { html } = await open(parcelAt(S.outForDelivery).trackingNo, { to: S.delivered });
    expect(html).toContain("ชื่อผู้รับ");
    expect(html).toContain('name="receiverName"');
    expect(html).not.toContain('name="reason"');
  });

  test("DLV-006 ฟอร์มส่งไม่สำเร็จมีช่องเหตุผล และหลังส่งไม่สำเร็จไม่มีปุ่มเปลี่ยนสถานะอีก", async () => {
    signInAs(somchai.id);
    const { html } = await open(parcelAt(S.outForDelivery).trackingNo, { to: S.failed });
    expect(html).toContain('name="reason"');
    expect(html).not.toContain('name="receiverName"');

    const ended = (await open(parcelAt(S.failed).trackingNo)).html;
    expect(buttons(ended)).toEqual([]);
    expect(ended).toContain("คำสั่งซื้อถูกยกเลิก");
  });
});

describe("DLV-007 บันทึกไม่สำเร็จ", () => {
  test("DLV-007 ฐานข้อมูลบันทึกไม่ได้ action โยน error ให้ฟอร์มแสดงบันทึกไม่สำเร็จ และไม่มีอะไรเปลี่ยน", async () => {
    const parcel = parcelAt(S.awaitingPacking);
    signInAs(somchai.id);
    db.exec("CREATE TRIGGER fail_order_update BEFORE UPDATE ON orders BEGIN SELECT RAISE(ABORT, 'จำลองบันทึกไม่สำเร็จ'); END");

    await expect(
      submit({ trackingNo: parcel.trackingNo, from: S.awaitingPacking, to: S.handedOver, location: "จุดรับพัสดุบางนา", province: "กรุงเทพมหานคร" }),
    ).rejects.toThrow("จำลองบันทึกไม่สำเร็จ");
    expect(historyCount(parcel.id)).toBe(1);
  });
});

describe("MAP-001 MAP-002 ช่องจังหวัดของฟอร์มเปลี่ยนสถานะ", () => {
  const provinceOf = (parcelId: number) =>
    db.prepare("SELECT province FROM parcel_history WHERE parcel_id = ? ORDER BY id DESC LIMIT 1").get(parcelId)?.province;

  test("MAP-002 ฟอร์มมีช่องจังหวัดครบทุกจังหวัด เลือกจังหวัดของรายการล่าสุดไว้ให้ก่อน และเปลี่ยนเป็นจังหวัดอื่นได้", async () => {
    const parcel = parcelAt(S.handedOver);
    changeParcelStatus(db, {
      trackingNo: parcel.trackingNo,
      actor: somchai,
      from: S.handedOver,
      to: S.inTransit,
      location: "ศูนย์คัดแยกลำปาง",
      province: "ลำปาง",
    });
    signInAs(somchai.id);

    const { html = "" } = await open(parcel.trackingNo, { to: S.outForDelivery });
    const select = html.match(/<select[^>]*name="province"[^>]*>([^]*?)<\/select>/);
    expect(select).not.toBeNull();
    expect(html).toContain('<label for="field-province">จังหวัด</label>');
    expect(select?.[1].match(/<option value="[^"]+"/g)).toHaveLength(PROVINCES.length);
    expect(select?.[1].match(/<option[^>]*selected=""[^>]*>([^<]*)</)?.[1]).toBe("ลำปาง");
    expect(select?.[1]).toContain(">กรุงเทพมหานคร<");
  });

  test("MAP-001 กดบันทึกพร้อมจังหวัดที่เลือก รายการใหม่มีจังหวัดนั้น", async () => {
    const parcel = parcelAt(S.handedOver);
    signInAs(somchai.id);

    const result = await submit({
      trackingNo: parcel.trackingNo,
      from: S.handedOver,
      to: S.inTransit,
      location: "ศูนย์คัดแยกลำปาง",
      province: "ลำปาง",
    });
    expect(result.redirect).toBe(`/parcels/${parcel.trackingNo}?saved=1`);
    expect(provinceOf(parcel.id)).toBe("ลำปาง");
  });

  test("MAP-001 ไม่เลือกจังหวัด ได้ข้อความ เลือกจังหวัด ใต้ช่อง และพัสดุไม่เปลี่ยน", async () => {
    const parcel = parcelAt(S.handedOver);
    signInAs(somchai.id);

    for (const province of [undefined, "", "ไม่มีจังหวัดนี้"]) {
      const values: Record<string, string> = { trackingNo: parcel.trackingNo, from: S.handedOver, to: S.inTransit, location: "ศูนย์คัดแยกลำปาง" };
      if (province !== undefined) values.province = province;
      expect((await submit(values)).state?.fieldErrors).toEqual({ province: "เลือกจังหวัด" });
    }
    expect(historyCount(parcel.id)).toBe(2);
  });
});

describe("DLV-009 พัสดุของคำสั่งซื้อที่ยกเลิกแล้ว", () => {
  test("DLV-009 คำสั่งซื้อถูกยกเลิก หน้าแสดงคำสั่งซื้อถูกยกเลิก ไม่มีปุ่มเปลี่ยนสถานะ", async () => {
    const parcel = parcelAt(S.awaitingPacking);
    db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(ORDER_STATUS.cancelled, parcel.orderId);
    signInAs(somchai.id);

    const { html } = await open(parcel.trackingNo);
    expect(html).toContain("คำสั่งซื้อถูกยกเลิก");
    expect(buttons(html)).toEqual([]);
    expect(html).not.toContain('name="location"');
  });
});
