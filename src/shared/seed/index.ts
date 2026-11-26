import { readFileSync } from "node:fs";
import { hashPassword } from "@/features/account/server/password";
import { saveImageFile } from "@/features/product-listing/server/image-files";
import { saveModelFile } from "@/features/product-listing/server/model-files";
import { transaction, type Db } from "@/shared/db";
import { addAccount, addProduct, addShop } from "@/shared/db/builders";
import { CATEGORIES, LOCATIONS, PERSON_FIRST, PERSON_LAST, SAMPLE_PHOTOS, SHOP_NAME_FIRST, SHOP_NAME_LAST } from "./catalog";
import { addSampleOrders } from "./orders";

/** รหัสผ่านสาธิตของบัญชีตัวอย่าง ห้ามใช้กับระบบจริง (เขียนไว้ใน README) */
export const ADMIN_PASSWORD = "admin1234";
export const DEMO_PASSWORD = "demo1234";
export const ADMIN_EMAIL = "admin@example.com";

const SHOP_COUNT = 50;
const PRODUCTS_PER_SHOP = 20;
const BUYER_COUNT = 3;
const MINUTE = 60 * 1000;

/** สินค้าตัวอย่างที่มีไฟล์ 3 มิติ (P3D-006) index คือลำดับสินค้าในร้านแรก ไฟล์และที่มาอยู่ใน models/SOURCES.txt */
const SAMPLE_MODELS = [
  { index: 5, name: "เก้าอี้ผ้ากำมะหยี่", file: "SheenChair.glb" },
  { index: 11, name: "แจกันแก้วใส่ดอกไม้", file: "GlassVaseFlowers.glb" },
];

// สุ่มแบบกำหนดเมล็ด รันกี่ครั้งก็ได้ข้อมูลหน้าตาเดิม
function createRandom(seedValue: number) {
  let state = seedValue;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: T[]) => items[Math.floor(next() * items.length)],
  };
}

/** ราคาลงท้ายด้วย 9 แบบร้านทั่วไป */
function nicePrice(value: number): number {
  return Math.max(1, Math.round(value / 10) * 10 - 1);
}

/**
 * สร้างข้อมูลตัวอย่างของชุด 1 ถ้ายังไม่เคยสร้าง รวมคำสั่งซื้อตัวอย่างของร้าน seller01 ครบทุกสถานะ
 * รู้ว่าเคยสร้างแล้วจากบัญชีผู้ดูแลแพลตฟอร์มตัวอย่าง จึงรันซ้ำได้โดยข้อมูลไม่ซ้ำ
 */
export async function seed(db: Db): Promise<{ created: boolean }> {
  if (db.prepare("SELECT 1 FROM accounts WHERE email = ?").get(ADMIN_EMAIL)) return { created: false };

  const random = createRandom(20261124);
  const [adminHash, ...demoHashes] = await Promise.all([
    hashPassword(ADMIN_PASSWORD),
    ...Array.from({ length: SHOP_COUNT + BUYER_COUNT }, () => hashPassword(DEMO_PASSWORD)),
  ]);
  const now = Date.now();

  transaction(db, () => {
    addAccount(db, { email: ADMIN_EMAIL, passwordHash: adminHash, displayName: "ผู้ดูแลแพลตฟอร์ม", isAdmin: true });

    for (let b = 1; b <= BUYER_COUNT; b++) {
      addAccount(db, {
        email: `buyer${b}@example.com`,
        passwordHash: demoHashes.pop(),
        displayName: `ผู้ซื้อตัวอย่าง ${b}`,
      });
    }

    for (let s = 0; s < SHOP_COUNT; s++) {
      const number = String(s + 1).padStart(2, "0");
      const ownerName = `${PERSON_FIRST[s % PERSON_FIRST.length]} ${PERSON_LAST[Math.floor(s / PERSON_FIRST.length)]}`;
      const shopName = `${SHOP_NAME_FIRST[s % SHOP_NAME_FIRST.length]}${SHOP_NAME_LAST[Math.floor(s / SHOP_NAME_FIRST.length)]}`;
      const owner = addAccount(db, {
        email: `seller${number}@example.com`,
        passwordHash: demoHashes.pop(),
        displayName: ownerName,
        phone: `01000000${number}`,
      });
      const shop = addShop(db, {
        ownerAccountId: owner.id,
        name: shopName,
        description: `${shopName} ร้านตัวอย่างของ Blanksong คัดของดีราคาเป็นมิตร ส่งไว`,
        logoUrl: `/sample-images/shop${s + 1}.svg`,
        origin: { name: ownerName, phone: `01000000${number}`, address: `${s + 1}/9 ถนนตัวอย่าง`, ...LOCATIONS[s % LOCATIONS.length] },
        openedAt: new Date(now - 30 * 24 * 60 * MINUTE).toISOString(),
      });

      // รูปที่ส่งขึ้นมาเป็นของร้านที่ส่ง (PRD-012) จึงเก็บรูปถ่ายร้านละชุด
      const photoUrls = new Map<string, string>();
      const photoUrl = (file: string, savedAt: Date) => {
        const known = photoUrls.get(file);
        if (known) return known;
        const saved = saveImageFile(db, shop.id, readFileSync(new URL(`./photos/${file}`, import.meta.url)), savedAt);
        if (!saved.ok) throw new Error(`${file}: ${saved.error}`);
        photoUrls.set(file, saved.url);
        return saved.url;
      };

      for (let p = 0; p < PRODUCTS_PER_SHOP; p++) {
        const index = s * PRODUCTS_PER_SHOP + p;
        const category = CATEGORIES[index % CATEGORIES.length];
        const sample = SAMPLE_MODELS.find((model) => model.index === index);
        // สุ่มชื่อทุกชิ้นแม้ชิ้นที่ใช้ชื่อของไฟล์ 3 มิติ ลำดับการสุ่มของชิ้นอื่นจึงไม่เปลี่ยน
        const noun = random.pick(category.nouns);
        const randomName = `${noun} ${random.pick(category.details)}`;
        const name = sample?.name ?? randomName;
        const photos = SAMPLE_PHOTOS[sample?.name ?? noun];
        const basePrice = nicePrice(random.int(category.minPrice, category.maxPrice));
        const withOptions = index % 8 === 0;
        const soldOut = index % 50 === 25;
        const options = withOptions ? category.options : [];
        const variantCount = options.reduce((total, option) => total * option.values.length, 1);
        const lastOptionSize = options.at(-1)?.values.length ?? 1;
        const step = Math.max(10, Math.round(basePrice / 100) * 10);
        const createdAt = new Date(now - (SHOP_COUNT * PRODUCTS_PER_SHOP - index) * 37 * MINUTE).toISOString();
        const imageCount = 1 + (index % 3);

        const product = addProduct(db, {
          shopId: shop.id,
          categoryId: category.categoryId,
          name,
          description: `${name} จาก${shopName} สินค้าตัวอย่างสำหรับทดลองระบบ`,
          options,
          variants: Array.from({ length: variantCount }, (_, v) => ({
            // ค่าตัวเลือกสุดท้ายที่ใหญ่ขึ้นแพงขึ้นทีละขั้น เพื่อให้มีสินค้าที่ราคาแต่ละแบบย่อยต่างกัน
            price: basePrice + (v % lastOptionSize) * step,
            stock: soldOut ? 0 : random.int(1, 10) === 1 ? random.int(1, 5) : random.int(6, 80),
          })),
          images: photos
            ? photos.slice(0, imageCount).map((file) => photoUrl(file, new Date(createdAt)))
            : Array.from({ length: imageCount }, (_, i) => `/sample-images/s${index + 1}-${i + 1}-c${category.categoryId}.svg`),
          recordStockHistory: true,
          createdAt,
          publishedAt: createdAt,
        });
        if (sample) {
          const bytes = readFileSync(new URL(`./models/${sample.file}`, import.meta.url));
          const saved = saveModelFile(db, shop.id, sample.file, bytes, new Date(createdAt));
          if (!saved.ok) throw new Error(`${sample.file}: ${saved.error}`);
          db.prepare("UPDATE products SET model_url = ? WHERE id = ?").run(saved.url, product.id);
        }
      }
    }
  });

  await addSampleOrders(db, now);
  return { created: true };
}
