import { readdirSync, readFileSync } from "node:fs";
import { beforeAll, describe, expect, test } from "vitest";
import { verifyPassword } from "@/features/account/server/password";
import { getProductDetail } from "@/features/browse/server/product-detail";
import { routeText } from "@/features/delivery/server/route";
import { getTrackingView } from "@/features/delivery/server/tracking";
import { getImageFile, IMAGE_URL_PREFIX, isShopUpload } from "@/features/product-listing/server/image-files";
import { getModelFile } from "@/features/product-listing/server/model-files";
import { modelFileError } from "@/features/product-listing/server/product-rules";
import type { Db } from "@/shared/db";
import { addProduct } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";
import { detectImageType } from "@/shared/rules";
import { ADMIN_PASSWORD, DEMO_PASSWORD, seed } from "@/shared/seed";
import { SAMPLE_PHOTOS } from "@/shared/seed/catalog";
import { ORDER_STATUS } from "@/shared/statuses";

let db: Db;

const count = (sql: string, ...params: (string | number)[]) => Number(db.prepare(sql).get(...params)?.n);

const PHOTO_DIR = new URL("./photos/", import.meta.url);
const photoFiles = readdirSync(PHOTO_DIR).filter((file) => file !== "SOURCES.txt");
const photoBytes = new Map(photoFiles.map((file) => [file, readFileSync(new URL(file, PHOTO_DIR))]));

// สร้างข้อมูลตัวอย่างครั้งเดียวแล้วใช้ร่วมกันทั้งไฟล์ เพราะ hash รหัสผ่านใช้เวลา
beforeAll(async () => {
  db = createTestDb();
  expect((await seed(db)).created).toBe(true);
});

describe("ข้อมูลตัวอย่าง", () => {
  test("มี 50 ร้าน 1,000 สินค้าที่ขายอยู่ และ 12 หมวดหมู่ ที่ทุกหมวดมีสินค้าอย่างน้อย 10 รายการ", () => {
    expect(count("SELECT count(*) AS n FROM shops WHERE status = 'เปิดอยู่'")).toBe(50);
    expect(count("SELECT count(*) AS n FROM products WHERE status = 'ขายอยู่'")).toBe(1000);
    expect(count("SELECT count(*) AS n FROM categories")).toBe(12);
    const smallest = db
      .prepare(
        `SELECT min(n) AS n FROM (
           SELECT c.id, count(p.id) AS n FROM categories c LEFT JOIN products p ON p.category_id = c.id GROUP BY c.id
         )`,
      )
      .get()?.n;
    expect(Number(smallest)).toBeGreaterThanOrEqual(10);
  });

  test("ทุกสินค้ามีแบบย่อย ราคา 1 ถึง 1,000,000 บาท และรูปอย่างน้อย 1 รูป", () => {
    expect(count("SELECT count(*) AS n FROM products p WHERE NOT EXISTS (SELECT 1 FROM variants v WHERE v.product_id = p.id)")).toBe(0);
    expect(count("SELECT count(*) AS n FROM variants WHERE price IS NULL OR price < 1 OR price > 1000000")).toBe(0);
    expect(count("SELECT count(*) AS n FROM products p WHERE NOT EXISTS (SELECT 1 FROM product_images i WHERE i.product_id = p.id)")).toBe(0);
  });

  test("มีสินค้าที่มีตัวเลือกอย่างน้อย 100 รายการ และสินค้าที่สต็อกเหลือ 0 อย่างน้อย 10 รายการ", () => {
    expect(count("SELECT count(DISTINCT product_id) AS n FROM product_options")).toBeGreaterThanOrEqual(100);
    expect(
      count("SELECT count(*) AS n FROM (SELECT product_id FROM variants GROUP BY product_id HAVING sum(stock) = 0)"),
    ).toBeGreaterThanOrEqual(10);
  });

  test("สต็อกตั้งต้นมีประวัติสต็อกที่ตรงกับตัวเลขสต็อก", () => {
    expect(
      count(
        `SELECT count(*) AS n FROM variants v
         WHERE v.stock <> coalesce((SELECT sum(change) FROM stock_history h WHERE h.variant_id = v.id), 0)`,
      ),
    ).toBe(0);
  });

  test("มีผู้ดูแลแพลตฟอร์ม 1 บัญชี และบัญชีผู้ซื้อกับผู้ขายตัวอย่างที่เข้าสู่ระบบด้วยรหัสผ่านใน README ได้", async () => {
    expect(count("SELECT count(*) AS n FROM accounts WHERE is_admin = 1")).toBe(1);
    const hashOf = (email: string) =>
      String(db.prepare("SELECT password_hash AS h FROM accounts WHERE email = ?").get(email)?.h);

    expect(await verifyPassword(ADMIN_PASSWORD, hashOf("admin@example.com"))).toBe(true);
    expect(await verifyPassword(DEMO_PASSWORD, hashOf("buyer1@example.com"))).toBe(true);
    expect(await verifyPassword(DEMO_PASSWORD, hashOf("seller01@example.com"))).toBe(true);
    expect(count("SELECT count(*) AS n FROM shops s JOIN accounts a ON a.id = s.owner_account_id WHERE a.email = ?", "seller01@example.com")).toBe(1);
    expect(count("SELECT count(*) AS n FROM shops s JOIN accounts a ON a.id = s.owner_account_id WHERE a.email LIKE 'buyer%'")).toBe(0);
  });

  test("มีคำสั่งซื้อตัวอย่างของร้าน seller01 ครบทุกสถานะ พร้อมพัสดุของคำสั่งซื้อที่จ่ายแล้ว", () => {
    const statuses = db
      .prepare(
        `SELECT o.status, count(*) AS n FROM orders o JOIN shops s ON s.id = o.shop_id JOIN accounts a ON a.id = s.owner_account_id
         WHERE a.email = 'seller01@example.com' GROUP BY o.status`,
      )
      .all()
      .map((row) => [row.status, row.n]);
    expect(Object.fromEntries(statuses)).toEqual({ จ่ายแล้ว: 2, กำลังจัดส่ง: 2, สำเร็จ: 3, ยกเลิก: 2 });
    expect(count("SELECT count(*) AS n FROM orders o WHERE o.status <> 'ยกเลิก' AND NOT EXISTS (SELECT 1 FROM parcels p WHERE p.order_id = o.id)")).toBe(0);
    expect(count("SELECT count(*) AS n FROM parcels WHERE status = 'ส่งสำเร็จ' AND receipt_confirmed_at IS NULL")).toBe(1);
  });

  test("MAP-010 มีพัสดุอย่างน้อย 2 ชิ้นที่ประวัติการจัดส่งผ่านอย่างน้อย 3 จังหวัด และพัสดุของคำสั่งซื้อที่กำลังจัดส่งของผู้ซื้อตัวอย่างมีหมุดอย่างน้อย 3 จังหวัดกับเส้นระหว่างหมุด", () => {
    expect(
      count("SELECT count(*) AS n FROM (SELECT parcel_id FROM parcel_history GROUP BY parcel_id HAVING count(DISTINCT province) >= 3)"),
    ).toBeGreaterThanOrEqual(2);

    for (const email of ["buyer1@example.com", "buyer2@example.com"]) {
      const buyer = db.prepare("SELECT id FROM accounts WHERE email = ?").get(email) as { id: number };
      const shipping = db
        .prepare("SELECT p.tracking_no FROM parcels p JOIN orders o ON o.id = p.order_id WHERE o.buyer_account_id = ? AND o.status = ?")
        .get(buyer.id, ORDER_STATUS.shipping) as { tracking_no: string };
      const route = getTrackingView(db, shipping.tracking_no, { id: buyer.id, isAdmin: false, shopId: null })?.route;
      expect(route?.pins.length, email).toBeGreaterThanOrEqual(3);
      expect(route?.passed.length, email).toBeGreaterThanOrEqual(2);
    }
  });

  test("MAP-010 พัสดุตัวอย่างทุกรายการในประวัติการจัดส่งมีจังหวัด", () => {
    expect(count("SELECT count(*) AS n FROM parcel_history WHERE province IS NULL")).toBe(0);
  });

  test("MAP-Q04 พัสดุตัวอย่างทุกชิ้น ข้อความเส้นทางมีชื่อจังหวัดครบทุกจังหวัดที่มีหมุด", () => {
    const admin = db.prepare("SELECT id FROM accounts WHERE is_admin = 1").get() as { id: number };
    const parcels = db.prepare("SELECT tracking_no FROM parcels").all() as { tracking_no: string }[];
    expect(parcels.length).toBeGreaterThan(0);
    for (const { tracking_no } of parcels) {
      const route = getTrackingView(db, tracking_no, { id: admin.id, isAdmin: true, shopId: null })!.route;
      if (!route) throw new Error(`${tracking_no} ไม่มีเส้นทาง`);
      for (const pin of route.pins) expect(routeText(route), tracking_no).toContain(pin.province);
    }
  });

  test("MAP-010 สร้างข้อมูลตัวอย่างซ้ำโดยไม่ล้างฐานข้อมูล ประวัติการจัดส่งไม่เพิ่มหรือซ้ำ", async () => {
    const before = count("SELECT count(*) AS n FROM parcel_history");

    expect((await seed(db)).created).toBe(false);
    expect(count("SELECT count(*) AS n FROM parcel_history")).toBe(before);
  });

  test("P3D-006 มีสินค้า 2 ชิ้นที่ README บอกว่ามีไฟล์ 3 มิติ เปิดหน้าสินค้าได้ และไฟล์เป็น GLB ที่ไม่เกิน 5 MB", () => {
    const rows = db.prepare("SELECT id, name, model_url FROM products WHERE model_url IS NOT NULL ORDER BY id").all() as {
      id: number;
      name: string;
      model_url: string;
    }[];
    expect(rows.map((row) => row.name)).toEqual(["เก้าอี้ผ้ากำมะหยี่", "แจกันแก้วใส่ดอกไม้"]);

    const readme = readFileSync("README.md", "utf8");
    for (const row of rows) {
      expect(readme).toContain(row.name);
      expect(getProductDetail(db, row.id)?.model).toBe(row.model_url);
      const file = getModelFile(db, row.model_url.split("/").pop()!);
      expect(file && modelFileError(file.data, file.data.byteLength)).toBeUndefined();
      expect(file?.data.byteLength).toBeLessThanOrEqual(5 * 1024 * 1024);
    }
  });

  test("P3D-006 สินค้าตัวอย่างชิ้นอื่นไม่มีไฟล์ 3 มิติ", () => {
    expect(count("SELECT count(*) AS n FROM products WHERE model_url IS NULL")).toBe(998);
  });

  test("รูปถ่ายทุกไฟล์ใน photos/ มีที่มา ผู้สร้าง สัญญาอนุญาต CC0 หรือสาธารณสมบัติ และชื่อสินค้าที่ตรงกับที่ใช้ ใน SOURCES.txt", () => {
    const sources = readFileSync(new URL("SOURCES.txt", PHOTO_DIR), "utf8");
    const entries = new Map(sources.split(/\n\s*\n/).map((block) => [block.split("\n")[0].trim(), block]));
    expect(photoFiles.length).toBeGreaterThan(0);
    for (const file of photoFiles) {
      const entry = entries.get(file);
      expect(entry, file).toMatch(/^ {2}ที่มา: https:\/\/\S+/m);
      expect(entry, file).toMatch(/^ {2}ผู้สร้าง: \S/m);
      expect(entry, file).toMatch(/^ {2}สัญญาอนุญาต: (CC0 1\.0|สาธารณสมบัติ)/m);
      // ป้ายที่เป็นสาธารณสมบัติเฉพาะในสหรัฐอเมริกา หรือครอบคลุมแค่ภาพของงานสองมิติ ใช้ไม่ได้
      expect(entry, file).not.toMatch(/\{\{PD-(US-|Art)/);
      // ป้าย Pixabay ต้องมีชื่อผู้ตรวจและวันที่ตรวจสัญญาอนุญาตของ Wikimedia Commons
      if (entry?.includes("{{Pixabay")) expect(entry, file).toMatch(/\{\{Pixabay\|[^}]*status=confirmed\|reviewer=[^|}]+\|date=\d{4}-\d{2}-\d{2}\}\}/);
    }
    for (const [name, files] of Object.entries(SAMPLE_PHOTOS)) {
      for (const file of files!) expect(entries.get(file), file).toContain(`\n  สินค้า: ${name}\n`);
    }
  });

  test("รูปถ่ายเป็น JPEG ไฟล์ละไม่เกิน 160 KB รวมไม่เกิน 5 MB และทุกไฟล์มีสินค้าใช้", () => {
    expect(new Set(Object.values(SAMPLE_PHOTOS).flat())).toEqual(new Set(photoFiles));
    for (const [file, bytes] of photoBytes) {
      expect(detectImageType(bytes), file).toBe("image/jpeg");
      expect(bytes.byteLength, file).toBeLessThanOrEqual(160 * 1024);
    }
    expect([...photoBytes.values()].reduce((total, bytes) => total + bytes.byteLength, 0)).toBeLessThan(5 * 1024 * 1024);
  });

  test("สินค้าตัวอย่างใช้รูปถ่ายตามชื่อ เป็นรูปที่ร้านนั้นส่งขึ้นมาเอง ร้านละหนึ่งสำเนา และชื่อที่ไม่มีรูปถ่ายใช้รูป SVG", () => {
    const products = db.prepare("SELECT id, shop_id, name FROM products ORDER BY id").all() as { id: number; shop_id: number; name: string }[];
    const photoNames = Object.keys(SAMPLE_PHOTOS);
    const usedNames = new Set<string>();
    for (const product of products) {
      const urls = db.prepare("SELECT url FROM product_images WHERE product_id = ? ORDER BY position").all(product.id).map((row) => String(row.url));
      const photoName = photoNames.find((name) => product.name === name || product.name.startsWith(`${name} `));
      if (!photoName) {
        expect(urls.every((url) => url.startsWith("/sample-images/")), product.name).toBe(true);
        continue;
      }
      usedNames.add(photoName);
      expect(urls.length).toBeGreaterThan(0);
      urls.forEach((url, i) => {
        expect(isShopUpload(db, product.shop_id, url), product.name).toBe(true);
        const stored = getImageFile(db, url.slice(IMAGE_URL_PREFIX.length));
        expect(stored?.contentType).toBe("image/jpeg");
        expect(Buffer.from(stored!.data).equals(photoBytes.get(SAMPLE_PHOTOS[photoName]![i])!), product.name).toBe(true);
      });
    }
    expect([...usedNames].sort()).toEqual(photoNames.sort());
    expect(count("SELECT count(*) AS n FROM (SELECT 1 FROM product_image_files GROUP BY shop_id, data HAVING count(*) > 1)")).toBe(0);
  });

  test("รันซ้ำแล้วข้อมูลไม่ซ้ำ และของที่ผู้ใช้สร้างเองยังอยู่", async () => {
    const shopId = Number(db.prepare("SELECT id FROM shops LIMIT 1").get()?.id);
    addProduct(db, { shopId, name: "สินค้าใหม่ของผู้ขาย" });

    expect((await seed(db)).created).toBe(false);
    expect(count("SELECT count(*) AS n FROM products")).toBe(1001);
    expect(count("SELECT count(*) AS n FROM shops")).toBe(50);
    expect(count("SELECT count(*) AS n FROM accounts")).toBe(54);
  });
});
