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
import { parseBrowseParams } from "@/features/browse/search-params";
import { searchProducts } from "@/features/browse/server/search";
import { AWAITING_REVIEW, countOrdersAwaitingReview, listBuyerOrders } from "@/features/checkout/server/buyer-orders";
import { EDIT_WINDOW_MS } from "@/features/review/rules";
import { getReviewImage, REVIEW_IMAGE_URL_PREFIX } from "@/features/review/server/image-files";
import { productRating, shopRating } from "@/features/review/server/ratings";
import { countUnansweredReviews, submitReview } from "@/features/review/server/reviews";
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
}, 60_000);

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
    // คำสั่งซื้อที่สำเร็จเกิน 2 รายการคือคำสั่งซื้อของรีวิวตัวอย่าง (REV-019)
    expect(Object.fromEntries(statuses)).toMatchObject({ จ่ายแล้ว: 2, กำลังจัดส่ง: 2, ยกเลิก: 2 });
    expect(Object.fromEntries(statuses)["สำเร็จ"]).toBeGreaterThanOrEqual(2);
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

  test("REV-019 มีรีวิวอย่างน้อย 1,500 รีวิว สินค้า 600 ถึง 700 รายการมีรีวิวที่แสดงอยู่ และทุกรีวิวมาจากรายการในคำสั่งซื้อที่สำเร็จของผู้ซื้อตัวอย่าง", () => {
    expect(count("SELECT count(*) AS n FROM reviews")).toBeGreaterThanOrEqual(1500);
    const rated = count("SELECT count(DISTINCT product_id) AS n FROM reviews WHERE status = 'แสดงอยู่'");
    expect(rated).toBeGreaterThanOrEqual(600);
    expect(rated).toBeLessThanOrEqual(700);
    expect(
      count(
        `SELECT count(*) AS n FROM reviews r
         JOIN order_items i ON i.id = r.order_item_id JOIN orders o ON o.id = i.order_id JOIN accounts a ON a.id = o.buyer_account_id
         WHERE o.status <> 'สำเร็จ' OR a.email NOT LIKE 'buyer%@example.com' OR r.buyer_account_id <> o.buyer_account_id
            OR r.product_id <> i.product_id OR r.shop_id <> o.shop_id OR r.created_at < o.completed_at`,
      ),
    ).toBe(0);
  });

  test("REV-019 สัดส่วนของแต่ละดาว จำนวนรีวิวต่อสินค้า ผู้เขียน ข้อความ รูป คำตอบของร้าน และรีวิวที่ถูกซ่อน อยู่ในช่วงที่กำหนด", () => {
    const total = count("SELECT count(*) AS n FROM reviews");
    const percent = (where: string) => (count(`SELECT count(*) AS n FROM reviews WHERE ${where}`) * 100) / total;
    const ranges: [number, number, number][] = [
      [5, 45, 60],
      [4, 20, 30],
      [3, 8, 15],
      [2, 3, 8],
      [1, 3, 8],
    ];
    for (const [stars, min, max] of ranges) {
      expect(percent(`rating = ${stars}`), `${stars} ดาว`).toBeGreaterThanOrEqual(min);
      expect(percent(`rating = ${stars}`), `${stars} ดาว`).toBeLessThanOrEqual(max);
    }
    const perProduct = db.prepare("SELECT min(n) AS low, max(n) AS high FROM (SELECT count(*) AS n FROM reviews GROUP BY product_id)").get();
    expect(Number(perProduct?.low)).toBeGreaterThanOrEqual(1);
    expect(Number(perProduct?.high)).toBeLessThanOrEqual(12);

    expect(count("SELECT count(DISTINCT buyer_account_id) AS n FROM reviews")).toBeGreaterThanOrEqual(20);
    expect(count("SELECT count(DISTINCT display_name) AS n FROM accounts WHERE email LIKE 'buyer%@example.com'")).toBe(
      count("SELECT count(*) AS n FROM accounts WHERE email LIKE 'buyer%@example.com'"),
    );
    expect(percent("body <> ''")).toBeGreaterThanOrEqual(70);
    expect(count("SELECT count(*) AS n FROM (SELECT 1 FROM reviews WHERE body <> '' GROUP BY product_id, body HAVING count(*) > 1)")).toBe(0);
    expect(count("SELECT count(DISTINCT review_id) AS n FROM review_images")).toBeGreaterThanOrEqual(100);
    expect(percent("reply_body IS NOT NULL")).toBeGreaterThanOrEqual(30);
    expect(percent("reply_body IS NOT NULL")).toBeLessThanOrEqual(50);
    expect(count("SELECT count(*) AS n FROM reviews WHERE status = 'ถูกซ่อน' AND hidden_reason <> ''")).toBeGreaterThanOrEqual(5);
  });

  test("REV-019 รูปในรีวิวเปิดได้ และเป็นรูปที่ผู้เขียนส่งขึ้นมาเอง", () => {
    const images = db.prepare("SELECT url FROM review_images").all() as { url: string }[];
    for (const image of images) {
      expect(image.url.startsWith(REVIEW_IMAGE_URL_PREFIX)).toBe(true);
      expect(getReviewImage(db, image.url.slice(REVIEW_IMAGE_URL_PREFIX.length))).not.toBeNull();
    }
    expect(
      count(
        `SELECT count(*) AS n FROM review_images i JOIN reviews r ON r.id = i.review_id
         WHERE NOT EXISTS (SELECT 1 FROM review_image_files f WHERE '${REVIEW_IMAGE_URL_PREFIX}' || f.key = i.url AND f.account_id = r.buyer_account_id)`,
      ),
    ).toBe(0);
  });

  test("REV-019 วันที่ส่งรีวิวกระจายใน 90 วันก่อนวันที่สร้างข้อมูลตัวอย่าง", () => {
    const day = 24 * 60 * 60 * 1000;
    const ages = (db.prepare("SELECT created_at FROM reviews").all() as { created_at: string }[]).map((row) => Date.now() - Date.parse(row.created_at));
    expect(Math.max(...ages)).toBeLessThanOrEqual(90 * day);
    expect(Math.min(...ages)).toBeGreaterThanOrEqual(0);
    for (let bucket = 0; bucket < 9; bucket++) {
      const inBucket = ages.filter((age) => age >= bucket * 10 * day && age < (bucket + 1) * 10 * day).length;
      expect(inBucket, `วันที่ ${bucket * 10} ถึง ${bucket * 10 + 10} ก่อนวันนี้`).toBeGreaterThan(ages.length / 18);
    }
  });

  test("REV-019 buyer1 มีรายการรอรีวิวอย่างน้อย 2 รายการและรีวิวที่ยังแก้ได้ ส่วนร้านของ seller01 มีรีวิวที่ยังไม่ตอบอย่างน้อย 3 รีวิว", () => {
    const buyer1 = Number(db.prepare("SELECT id FROM accounts WHERE email = 'buyer1@example.com'").get()?.id);
    const waiting = listBuyerOrders(db, buyer1, { status: AWAITING_REVIEW }).orders;
    expect(waiting.reduce((sum, order) => sum + order.awaitingReview, 0)).toBeGreaterThanOrEqual(2);
    expect(countOrdersAwaitingReview(db, buyer1)).toBe(waiting.length);
    expect(
      count(
        "SELECT count(*) AS n FROM reviews WHERE buyer_account_id = ? AND status = 'แสดงอยู่' AND created_at > ?",
        buyer1,
        new Date(Date.now() - EDIT_WINDOW_MS + 60 * 60 * 1000).toISOString(),
      ),
    ).toBeGreaterThanOrEqual(1);

    const shop1 = Number(
      db.prepare("SELECT s.id FROM shops s JOIN accounts a ON a.id = s.owner_account_id WHERE a.email = 'seller01@example.com'").get()?.id,
    );
    expect(countUnansweredReviews(db, shop1)).toBeGreaterThanOrEqual(3);
  });

  test("REV-019 หน้าแรกหน้าที่ 1 มีการ์ดที่แสดงคะแนนอย่างน้อย 8 จาก 20 ใบ และมีการ์ดที่ไม่มีคะแนนอย่างน้อย 1 ใบ", () => {
    const cards = searchProducts(db, parseBrowseParams({})).items;
    expect(cards).toHaveLength(20);
    const rated = cards.filter((card) => card.rating).length;
    expect(rated).toBeGreaterThanOrEqual(8);
    expect(rated).toBeLessThan(20);
  });

  test("REV-Q02 คะแนนของสินค้าตัวอย่าง 20 รายการและร้านตัวอย่าง 5 ร้าน ตรงกับค่าที่คิดจากรายการรีวิว", () => {
    const byHand = (column: string, id: number) => {
      const ratings = (db.prepare(`SELECT rating FROM reviews WHERE ${column} = ? AND status = 'แสดงอยู่'`).all(id) as { rating: number }[]).map(
        (row) => row.rating,
      );
      const sum = ratings.reduce((total, rating) => total + rating, 0);
      return { average: Math.round((sum * 10) / ratings.length) / 10, count: ratings.length };
    };
    const products = db.prepare("SELECT DISTINCT product_id AS id FROM reviews WHERE status = 'แสดงอยู่' ORDER BY product_id DESC LIMIT 20").all() as { id: number }[];
    expect(products).toHaveLength(20);
    for (const { id } of products) {
      expect(productRating(db, id)).toMatchObject(byHand("product_id", id));
      const name = String(db.prepare("SELECT name FROM products WHERE id = ?").get(id)?.name);
      const card = searchProducts(db, parseBrowseParams({ q: name })).items.find((item) => item.id === id);
      expect(card?.rating).toEqual(byHand("product_id", id));
    }
    for (let shopId = 1; shopId <= 5; shopId++) expect(shopRating(db, shopId)).toMatchObject(byHand("shop_id", shopId));
  });

  test("REV-019 สร้างข้อมูลตัวอย่างซ้ำหลังผู้ซื้อเขียนรีวิวเพิ่ม รีวิวตัวอย่างไม่ถูกสร้างซ้ำ และคะแนนเฉลี่ยของทุกสินค้าไม่เปลี่ยน", async () => {
    const totals = () =>
      JSON.stringify(db.prepare("SELECT product_id, sum(rating) AS s, count(*) AS n FROM reviews WHERE status = 'แสดงอยู่' GROUP BY product_id").all());
    const before = count("SELECT count(*) AS n FROM reviews");
    const waiting = db
      .prepare(
        `SELECT i.id, o.buyer_account_id FROM order_items i JOIN orders o ON o.id = i.order_id JOIN accounts a ON a.id = o.buyer_account_id
         WHERE a.email = 'buyer1@example.com' AND o.status = 'สำเร็จ' AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.order_item_id = i.id) LIMIT 1`,
      )
      .get() as { id: number; buyer_account_id: number };
    expect(submitReview(db, { buyerAccountId: waiting.buyer_account_id, orderItemId: waiting.id, rating: 4, body: "ของสมหญิง", images: [] }).ok).toBe(true);
    const afterOwn = totals();

    expect((await seed(db)).created).toBe(false);
    expect(count("SELECT count(*) AS n FROM reviews")).toBe(before + 1);
    expect(count("SELECT count(*) AS n FROM reviews WHERE body = 'ของสมหญิง'")).toBe(1);
    expect(totals()).toBe(afterOwn);
  });

  test("รันซ้ำแล้วข้อมูลไม่ซ้ำ และของที่ผู้ใช้สร้างเองยังอยู่", async () => {
    const shopId = Number(db.prepare("SELECT id FROM shops LIMIT 1").get()?.id);
    addProduct(db, { shopId, name: "สินค้าใหม่ของผู้ขาย" });

    expect((await seed(db)).created).toBe(false);
    expect(count("SELECT count(*) AS n FROM products")).toBe(1001);
    expect(count("SELECT count(*) AS n FROM shops")).toBe(50);
    expect(count("SELECT count(*) AS n FROM accounts")).toBe(75);
  });
});
