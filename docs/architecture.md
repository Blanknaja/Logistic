# โครงโค้ดของ Blanksong

ไฟล์นี้สำหรับ agent ที่มาทำ ticket ต่อ อ่านให้จบก่อนเขียนโค้ด ตัดสินใจเรื่อง stack อยู่ใน `docs/adr/`

## stack

- Next.js 16.4 (App Router, Turbopack) กับ React 19 และ TypeScript หน้าเว็บกับฝั่งเซิร์ฟเวอร์อยู่ในแอปเดียว
- SQLite ผ่าน `node:sqlite` ที่มากับ Node 26 ไม่มี ORM เขียน SQL ตรงๆ
- test ใช้ Vitest ตรวจรูปแบบโค้ดใช้ ESLint
- Next.js รุ่นนี้ต่างจากที่ agent มักจำได้ ก่อนใช้ API ไหนให้เปิดคู่มือใน `node_modules/next/dist/docs/` เช่น `params` เป็น Promise และ `error.tsx` ได้ prop ชื่อ `retry`

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `pnpm install` | ติดตั้ง ต้องใช้ Node 26 ขึ้นไป |
| `pnpm dev` | สร้างข้อมูลตัวอย่างถ้ายังไม่มี แล้วเปิดแอปที่ http://localhost:3100 เปลี่ยนพอร์ตด้วย `PORT=3200 pnpm dev` |
| `pnpm seed` | รัน migration และสร้างข้อมูลตัวอย่างถ้ายังไม่มี รันซ้ำได้ |
| `pnpm seed --reset` | ลบฐานข้อมูลในเครื่องแล้วสร้างใหม่ |
| `pnpm check` | ตรวจชนิดข้อมูล ตรวจรูปแบบโค้ด และรัน test ทั้งหมด ต้องผ่านก่อน commit ใช้เวลาราว 5 วินาที |

ถ้าทำงานหลาย worktree พร้อมกัน ให้แต่ละ worktree ใช้พอร์ตของตัวเอง ฐานข้อมูลอยู่ที่ `data/blanksong.db` ของแต่ละ worktree จึงไม่ชนกัน

## แผนผังโฟลเดอร์

```
src/
  app/                    หน้าเว็บและ route ของ Next.js เท่านั้น ให้บางที่สุด
  features/<feature>/     หนึ่งโฟลเดอร์ต่อหนึ่ง feature ชื่อตรงกับไฟล์ใน docs/requirements/
    nav.ts                ลิงก์ของ feature นี้ในแถบนำทางและเมนูหลังบ้าน
    server/               กฎของธุรกิจ ไม่รู้จักหน้าเว็บ (lint ห้าม import next และ react)
    components/           component ที่ใช้เฉพาะ feature นี้
    actions.ts            server action ของ feature นี้ ("use server")
  shared/
    db/                   เปิดฐานข้อมูล transaction migration และตัวช่วยของ test
    statuses.ts           คำสถานะทุกคำของชุด 1 ใช้จากไฟล์นี้ ห้ามพิมพ์เอง
    format.ts             formatBaht formatDate formatDateTime formatNumber
    session.ts            getCurrentAccount()
    ui/states.tsx         EmptyState LoadingState ErrorState NotFoundState
    layout/               แถบนำทางด้านบน และ SellerMenu ของหลังบ้าน
    nav/                  ตัวรวมลิงก์จาก nav.ts ของทุก feature
    seed/                 ข้อมูลตัวอย่าง
scripts/seed.ts           คำสั่ง pnpm seed
```

feature ทั้ง 10: `account` `shop` `product-listing` `stock` `browse` `cart` `checkout` `payment` `shop-orders` `delivery`

ทำ ticket ไหน ให้แก้ในโฟลเดอร์ feature ของ ticket นั้นกับ route ของตัวเองใน `src/app/` เป็นหลัก ถ้าจำเป็นต้องแก้ `src/shared/` ให้แก้ให้น้อยที่สุด เพราะ ticket อื่นทำพร้อมกันอยู่ feature หนึ่งเรียกฟังก์ชันใน `server/` ของ feature อื่นได้

## ที่อยู่หน้าเว็บ

ใช้ตามตารางนี้เพื่อให้ ticket ที่ทำพร้อมกันลิงก์ถึงกันได้ถูก

| feature | ที่อยู่ |
|---|---|
| account | `/login` (รับ `?next=` เพื่อพากลับหน้าเดิม) `/signup` `/profile` `/forgot-password` `/reset-password` |
| shop | `/open-shop` `/seller` (หน้าแรกของหลังบ้าน) `/seller/settings` `/shops/[shopId]` (หน้าร้าน) |
| product-listing | `/seller/products` `/seller/products/new` `/seller/products/[productId]` |
| stock | `/seller/stock` |
| browse | `/` (หน้าแรก) `/products/[productId]` ส่วนหน้าผลค้นหา BRW เลือกเอง |
| cart | `/cart` |
| checkout | `/addresses` `/checkout` `/orders` `/orders/[orderNo]` |
| payment | `/pay/[groupId]` |
| shop-orders | `/seller/orders` `/seller/orders/[orderNo]` |
| delivery | `/parcels/[trackingNo]` (ผู้ขายและผู้ดูแลแพลตฟอร์มเปลี่ยนสถานะ) `/track/[trackingNo]` (หน้าติดตามพัสดุ) |

`src/app/seller/layout.tsx` ให้ ticket ของ shop สร้างที่เดียว และใช้ `<SellerMenu shopId={...} />` ในนั้น

## เพิ่มลิงก์ในแถบนำทางหรือเมนูหลังบ้าน

แก้ `src/features/<feature>/nav.ts` ของตัวเองเท่านั้น ไม่ต้องแก้ไฟล์กลาง

```ts
export const nav: FeatureNav = {
  header: [{ label: "ตะกร้า", href: "/cart", order: 20 }],
  sellerMenu: [{ label: "หน้าร้าน", href: (shopId) => `/shops/${shopId}`, order: 50 }],
};
```

`visibleTo: (viewer) => viewer !== null` ใช้ซ่อนลิงก์ตามคนที่ดู ลำดับที่จองไว้ (น้อยอยู่ซ้าย)

- แถบด้านบน: browse 10, cart 20, checkout 30, delivery 40, shop 50, account 90 ถึง 99
- เมนูหลังบ้าน: product-listing 10, stock 20, shop-orders 30, shop 40 (ตั้งค่าร้าน) และ 50 (หน้าร้าน)

## เพิ่มหน้า

1. สร้าง `src/app/<ที่อยู่>/page.tsx` ตามตารางข้างบน
2. หน้าอ่านข้อมูลผ่านฟังก์ชันใน `server/` เท่านั้น lint ห้ามเรียก `db.prepare` ในหน้า

```tsx
import { redirect } from "next/navigation";
import { listCartItems } from "@/features/cart/server/cart";
import { getDb } from "@/shared/db";
import { getCurrentAccount } from "@/shared/session";
import { EmptyState } from "@/shared/ui/states";

export default async function CartPage() {
  const viewer = await getCurrentAccount();
  if (!viewer) redirect("/login?next=/cart");
  const items = listCartItems(getDb(), viewer.id);
  if (items.length === 0) return <EmptyState title="ตะกร้ายังว่าง" />;
  // ...
}
```

- ทุกหน้าเรนเดอร์ใหม่ทุกครั้งที่มีคนเปิด (ตั้งไว้ที่ `src/app/layout.tsx`) ไม่ต้องตั้ง cache เอง
- ฟอร์มส่งไปที่ server action ใน `src/features/<feature>/actions.ts` แล้ว action เรียกฟังก์ชันใน `server/`
- ข้อมูลไม่มีหรือเป็นของคนอื่น ให้เรียก `notFound()` จาก `next/navigation` ทั้งสองกรณี จะได้หน้า "ไม่พบ" แบบเดียวกัน
- หน้ากำลังโหลด ใช้ `loading.tsx` ที่คืน `<LoadingState />` หรือ `<Suspense fallback={<LoadingState />}>`
- หน้าผิดพลาด ใช้ `<ErrorState />` ปุ่ม "ลองใหม่" โหลดข้อมูลหน้าเดิมใหม่โดยคงที่อยู่หน้าเว็บไว้
- สไตล์กลาง (`button` `button-secondary` `card` `field` `input` `field-error` `chips` `chip`) อยู่ใน `src/app/globals.css` สไตล์เฉพาะ feature ให้เขียน `*.module.css` ในโฟลเดอร์ feature ไม่แก้ globals.css
- ข้อความที่ผู้ใช้เห็นเป็นภาษาไทยตาม `GLOSSARY.md` ปุ่มสูงอย่างน้อย 44 จุด และหน้าต้องใช้ได้ที่จอกว้าง 360 จุด

## เพิ่มโมดูลกฎของธุรกิจ

สร้างไฟล์ใน `src/features/<feature>/server/` ทุกฟังก์ชันรับ `db` เป็นตัวแรก และรับ `now` เมื่อกฎขึ้นกับเวลา test จึงกำหนดเวลาได้

```ts
import { transaction, type Db } from "@/shared/db";
import { ORDER_STATUS } from "@/shared/statuses";

export function cancelExpiredOrders(db: Db, now: Date = new Date()): number {
  return transaction(db, () => {
    // ...
  });
}
```

- เขียนหลายแถวที่ต้องสำเร็จพร้อมกัน ให้ห่อด้วย `transaction(db, fn)` ซ้อนกันได้ ถ้า `fn` โยน error จะย้อนทั้งหมด `fn` ห้ามเป็น async
- `node:sqlite` ทำงานแบบ sync และแอปมีการเชื่อมต่อเดียว งานใน transaction เดียวจึงไม่มีคำขออื่นแทรก ใช้กันการแย่งสต็อกชิ้นสุดท้ายได้ และฐานข้อมูลมี `CHECK (stock >= 0)` กันไว้อีกชั้น
- เวลาเก็บเป็นข้อความ ISO แบบ UTC จาก `date.toISOString()` แสดงผลด้วย `formatDate` หรือ `formatDateTime` ซึ่งใช้เวลาประเทศไทย
- เงินเก็บเป็นจำนวนเต็มบาท แสดงด้วย `formatBaht(1290)` ได้ `฿1,290`
- สถานะใช้ค่าจาก `@/shared/statuses` ฐานข้อมูลมี CHECK ที่รับเฉพาะคำเหล่านี้
- ตารางทั้งหมดอยู่ใน `src/shared/db/migrations/0001-initial-schema.sql` อ่านไฟล์นี้ก่อนเขียน SQL

## เพิ่มหรือเปลี่ยนโครงข้อมูล

ห้ามแก้ไฟล์ migration ที่มีอยู่แล้ว ให้เพิ่มไฟล์ใหม่หนึ่งไฟล์ต่อหนึ่งการเปลี่ยน ใน `src/shared/db/migrations/`

- ชื่อไฟล์ `<เลขถัดไป 4 หลัก>-<เรื่องภาษาอังกฤษตัวเล็ก>.sql` เช่น `0002-cart-item-note.sql`
- เปลี่ยนแบบเพิ่มเท่านั้น เช่น `ALTER TABLE ... ADD COLUMN` หรือ `CREATE TABLE` / `CREATE INDEX` ไม่ลบหรือเปลี่ยนชื่อคอลัมน์ที่ ticket อื่นใช้
- ถ้าเลขชนกับ branch อื่นตอน merge ไม่ต้องเปลี่ยนชื่อ ระบบจำไฟล์ที่รันแล้วด้วยชื่อเต็ม และรันไฟล์ที่ยังไม่เคยรันทุกไฟล์ตามลำดับชื่อ
- แอปรัน migration เองตอนเปิดฐานข้อมูล ถ้าแก้ไฟล์ที่เคยรันในเครื่องแล้ว แอปจะไม่ยอมเปิด ให้ใช้ `pnpm seed --reset`

## เขียน test

ไฟล์ test วางข้างไฟล์ที่ทดสอบ ชื่อ `*.test.ts` หรือ `*.test.tsx` และรันได้โดยไม่ต้องต่ออินเทอร์เน็ต

```ts
import { beforeEach, expect, test } from "vitest";
import { addCartItem, addProduct, addAccount } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";
import type { Db } from "@/shared/db";

let db: Db;
beforeEach(() => {
  db = createTestDb();
});

test("ผู้ซื้อเห็นรายการในตะกร้าของตัวเอง", () => {
  const buyer = addAccount(db);
  const product = addProduct(db, { price: 290, stock: 5 });
  addCartItem(db, { accountId: buyer.id, variantId: product.variantIds[0] });
  // ...
});
```

- `createTestDb()` ให้ฐานข้อมูลใหม่ในหน่วยความจำที่รัน migration แล้ว แต่ละ test ไม่ชนกัน และรันพร้อมกันหลาย worktree ได้ `getDb()` จะโยน error ถ้าเรียกใน test
- `@/shared/db/builders` สร้างแถวตรงๆ โดยข้ามกฎของธุรกิจ มี `addAccount` `addSession` `addShop` `addProduct` (มีตัวเลือกและแบบย่อย) `addCartItem` `addAddress` `addOrder` `addPayment` `addParcel` lint ห้ามโค้ดของแอปใช้ ถ้าต้องการตัวสร้างเพิ่ม ให้เขียนไว้ในโฟลเดอร์ feature ของตัวเอง ไม่แก้ builders.ts
- บัญชีที่ `addAccount` สร้างมีรหัสผ่าน `TEST_PASSWORD`
- component ทดสอบด้วย `renderToStaticMarkup` ดูตัวอย่างใน `src/shared/ui/states.test.tsx`

## บัญชีที่เข้าสู่ระบบอยู่

```ts
import { getCurrentAccount, type CurrentAccount } from "@/shared/session";

const viewer: CurrentAccount | null = await getCurrentAccount();
// { id, email, displayName, isAdmin, shopId: number | null } หรือ null ถ้ายังไม่เข้าสู่ระบบ
```

- ใช้ได้ใน server component, server action และ route handler เรียกกี่ครั้งในคำขอเดียวก็อ่านฐานข้อมูลครั้งเดียว
- ตอนนี้อ่าน token จาก cookie `bs_session` แล้วหาในตาราง `sessions` คืน null ถ้าหมดอายุหรือบัญชีถูกระงับ การเข้าสู่ระบบ ออกจากระบบ และการต่ออายุ เป็นงานของ ticket ของ account
- โมดูลใน `server/` ไม่เรียก `getCurrentAccount()` ให้หน้าหรือ action ส่ง `viewer.id` เข้าไปแทน

## ข้อมูลตัวอย่าง

`pnpm seed` สร้าง 12 หมวดหมู่ 50 ร้าน 1,000 สินค้าที่ขายอยู่ พร้อมแบบย่อย สต็อก และประวัติสต็อก บัญชีผู้ดูแลแพลตฟอร์ม 1 บัญชี ผู้ขาย 50 บัญชี และผู้ซื้อ 3 บัญชี (อีเมลและรหัสผ่านอยู่ใน README) รูปเป็น SVG ที่สร้างจากชื่อไฟล์ที่ `/sample-images/<ชื่อ>.svg`

ระบบรู้ว่าเคยสร้างแล้วจากบัญชี `admin@example.com` จึงรันซ้ำได้ ถ้าต้องเพิ่มข้อมูลตัวอย่าง ให้แก้ `src/shared/seed/index.ts` และ test ใน `seed.test.ts`
