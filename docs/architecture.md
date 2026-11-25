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
| `pnpm check` | ตรวจชนิดข้อมูล ตรวจรูปแบบโค้ด และรัน test ทั้งหมด ต้องผ่านก่อน commit ใช้เวลาราว 20 วินาที |
| `pnpm test:full` | รัน test ทั้งหมดโดยให้ผู้ซื้อ 20 คนแย่งชิ้นสุดท้ายครบ 100 รอบตาม CHK-Q02 (`pnpm check` รัน 10 รอบ) ต้องผ่านก่อน merge งานที่แตะการสั่งซื้อหรือการจองสต็อก |
| `pnpm e2e` | เดินเส้นทางหลักผ่านหน้าเว็บจริงด้วย Playwright (`e2e/main-path.spec.ts`) และลองภาพ 3 มิติของสินค้าพร้อมวัด P3D-Q01 P3D-Q02 (`e2e/product-3d.spec.ts`) build แอปแล้วเปิดที่พอร์ต 3300 กับฐานข้อมูล `data/e2e.db` ที่ล้างใหม่ทุกครั้ง ใช้ Google Chrome ในเครื่อง ราว 1 นาที ไม่อยู่ใน `pnpm check` แต่ต้องผ่านก่อน merge งานที่แตะหน้าในเส้นทางหลัก วิธีใช้อื่นอยู่ใน README |

ถ้าทำงานหลาย worktree พร้อมกัน ให้แต่ละ worktree ใช้พอร์ตของตัวเอง ฐานข้อมูลอยู่ที่ `data/blanksong.db` ของแต่ละ worktree จึงไม่ชนกัน

## แผนผังโฟลเดอร์

```
src/
  app/                    หน้าเว็บและ route ของ Next.js เท่านั้น ให้บางที่สุด
  features/<feature>/     หนึ่งโฟลเดอร์ต่อหนึ่ง feature ชื่อตรงกับไฟล์ใน docs/requirements/
    nav.ts                ลิงก์ของ feature นี้ในแถบนำทางและเมนูหลังบ้าน
    server/               กฎของธุรกิจ ไม่รู้จักหน้าเว็บ (lint ห้าม import next และ react)
    components/           component ที่ใช้เฉพาะ feature นี้
    actions.ts            server action ของ feature นี้ ("use server") แยกเป็น <เรื่อง>-actions.ts ได้ เช่น checkout/address-actions.ts
  shared/
    db/                   เปิดฐานข้อมูล transaction migration และตัวช่วยของ test
    statuses.ts           คำสถานะทุกคำของชุด 1 ใช้จากไฟล์นี้ ห้ามพิมพ์เอง
    provinces.ts          77 จังหวัด ใช้ทั้งที่อยู่ของร้านและที่อยู่จัดส่ง
    format.ts             formatBaht formatDate formatDateTime formatTimeOrDateTime formatNumber
    session.ts            getCurrentAccount() requireAccount()
    rules.ts              กฎตรวจที่หลาย feature ใช้ร่วมกัน isPhone detectImageType
    paging.ts             PAGE_SIZE (20) และ pageCount() ของทุกรายการที่แบ่งหน้า
    result.ts             Checked<ค่า, ข้อผิดพลาด> ผล { ok: true } หรือ { ok: false, errors } ของงานที่ตรวจข้อมูลที่กรอก
    read-body.ts          readBodyUpTo() route ที่รับไฟล์อ่านเนื้อคำขอด้วยตัวนี้ หยุดทันทีที่เกินขนาด ไม่เชื่อ content-length
    ui/states.tsx         EmptyState LoadingState ErrorState NotFoundState
    ui/action-form.tsx    ActionForm Field SubmitButton ACTION_FAILED ฟอร์มที่ส่งไป server action
    ui/timeout.ts         settle() withTimeout() ACTION_TIMEOUT_MS รอผล server action ไม่เกิน 10 วินาที
    ui/loading-timeout.tsx LoadingTimeout หน้ากำลังโหลดที่เกิน 10 วินาทีกลายเป็นหน้าผิดพลาด
    layout/               แถบนำทางด้านบน และ SellerMenu ของหลังบ้าน
    nav/                  ตัวรวมลิงก์จาก nav.ts ของทุก feature
    seed/                 ข้อมูลตัวอย่าง
scripts/seed.ts           คำสั่ง pnpm seed
scripts/login-as.ts       พิมพ์ cookie ของบัญชีตัวอย่าง ไว้ลองหน้าที่ต้องเข้าสู่ระบบด้วย curl
scripts/seed-shop-orders.ts  เพิ่มคำสั่งซื้อตัวอย่างหลายสิบรายการให้ร้านของบัญชีผู้ขายหนึ่งบัญชี ไว้ลองแบ่งหน้า
scripts/measure-speed.ts  วัดความเร็วตาม product.md ส่วนที่ 6 (ดู README หัวข้อ "ความเร็ว")
e2e/                      test ที่เปิดหน้าเว็บจริงด้วย Playwright ตั้งค่าที่ playwright.config.ts
src/main-path.test.ts     test รอยต่อระหว่าง feature ของเส้นทางหลัก ใช้โมดูลจริงทั้งสองฝั่ง
```

feature ทั้ง 10: `account` `shop` `product-listing` `stock` `browse` `cart` `checkout` `payment` `shop-orders` `delivery`

requirement `product-3d-view.md` (P3D) ไม่มีโฟลเดอร์ของตัวเอง ฝั่งผู้ขาย (ส่งไฟล์ เปลี่ยน เอาออก และลบไฟล์ที่ไม่ใช้) อยู่ใน `product-listing` ฝั่งผู้ซื้อ (ทางเข้าในแกลเลอรีและตัวแสดง 3 มิติ) อยู่ใน `browse` เพราะไฟล์ 3 มิติเป็นช่องหนึ่งของฟอร์มสินค้าและแกลเลอรีหน้าสินค้า ซึ่งสองโฟลเดอร์นี้ดูแลอยู่แล้ว และใช้กฎเดียวกับรูปสินค้า เช่นสิทธิ์ของร้าน (PRD-012) และการเก็บไฟล์ที่ไม่ใช้ (PRD-014)

ทำ ticket ไหน ให้แก้ในโฟลเดอร์ feature ของ ticket นั้นกับ route ของตัวเองใน `src/app/` เป็นหลัก ถ้าจำเป็นต้องแก้ `src/shared/` ให้แก้ให้น้อยที่สุด เพราะ ticket อื่นทำพร้อมกันอยู่ feature หนึ่งเรียกฟังก์ชันใน `server/` ของ feature อื่นได้

## ที่อยู่หน้าเว็บ

ใช้ตามตารางนี้เพื่อให้ ticket ที่ทำพร้อมกันลิงก์ถึงกันได้ถูก

| feature | ที่อยู่ |
|---|---|
| account | `/login` (รับ `?next=` เพื่อพากลับหน้าเดิม) `/signup` `/profile` `/forgot-password` `/reset-password` |
| shop | `/open-shop` `/seller` (หน้าแรกของหลังบ้าน) `/seller/settings` `/shops/[shopId]` (หน้าร้าน) |
| product-listing | `/seller/products` `/seller/products/new` `/seller/products/[productId]` `/product-images/[key]` (รูปที่ผู้ขายส่งขึ้นมา) `/product-models/[key]` (ไฟล์ 3 มิติที่ผู้ขายส่งขึ้นมา หน้าฟอร์มส่งไฟล์ด้วย `POST /product-models?name=`) |
| stock | `/seller/stock` |
| browse | `/` (หน้าแรก) `/products/[productId]` ส่วนหน้าผลค้นหา BRW เลือกเอง |
| cart | `/cart` |
| checkout | `/addresses` `/checkout` `/orders` `/orders/[orderNo]` |
| payment | `/pay/[groupId]` |
| shop-orders | `/seller/orders` `/seller/orders/[orderNo]` |
| delivery | `/parcels/[trackingNo]` (ผู้ขายและผู้ดูแลแพลตฟอร์มเปลี่ยนสถานะ) `/track/[trackingNo]` (หน้าติดตามพัสดุ) |

`src/app/seller/layout.tsx` ให้ ticket ของ shop สร้างที่เดียว และใช้ `<SellerMenu shopId={...} />` ในนั้น

หน้าใน `/seller/...` เริ่มด้วย `const viewer = await requireShop("/seller/stock")` จาก `@/features/shop/require-shop` แทน `requireAccount` จะได้ `viewer.shopId` ที่ไม่เป็น null server action ของหลังบ้านใช้ `requireShopInAction(back)` จากไฟล์เดียวกัน ซึ่งพาแท็บที่ออกจากระบบไปแล้วไปหน้าเข้าสู่ระบบพร้อมข้อความ "กรุณาเข้าสู่ระบบอีกครั้ง" ยังไม่เข้าสู่ระบบถูกพาไปหน้าเข้าสู่ระบบแล้วกลับมาหน้าเดิม ยังไม่มีร้านถูกพาไปหน้าเปิดร้าน (SHP-001) layout พาไปหน้าเปิดร้านให้ด้วย แต่ไม่รู้ที่อยู่ของหน้า จึงไม่พาไปหน้าเข้าสู่ระบบแทนหน้า ข้อมูลที่ไม่มีหรือเป็นของร้านอื่นให้เรียก `notFound()` จะได้หน้า "ไม่พบหน้านี้" ของหลังบ้าน

## เพิ่มลิงก์ในแถบนำทางหรือเมนูหลังบ้าน

แก้ `src/features/<feature>/nav.ts` ของตัวเองเท่านั้น ไม่ต้องแก้ไฟล์กลาง

```ts
export const nav: FeatureNav = {
  header: [{ label: "ตะกร้า", href: "/cart", order: 20 }],
  sellerMenu: [{ label: "หน้าร้าน", href: (shopId) => `/shops/${shopId}`, order: 50 }],
};
```

layout ไม่วาดใหม่เมื่อกดลิงก์ไปหน้าอื่นที่ใช้ layout เดียวกัน ข้อความในเมนูที่เปลี่ยนตามข้อมูลจึงค้างได้ เมนูหลังบ้านขอหน้าใหม่เองทุกครั้งที่เปลี่ยนหน้า (`src/shared/layout/refresh-on-navigate.tsx`) ส่วนแถบด้านบน server action ที่เปลี่ยนตัวเลขในแถบ เช่นจำนวนในตะกร้า ต้องเรียก `refresh()` จาก `next/cache` ก่อน `redirect`

`visibleTo: (viewer) => viewer !== null` ใช้ซ่อนลิงก์ตามคนที่ดู `label` ใส่เป็นฟังก์ชัน `(viewer) => string` ได้เมื่อข้อความขึ้นกับคนที่ดู ในเมนูหลังบ้านใส่เป็น `(shopId) => string` ได้ เช่น "รอจัดของ 5" ลำดับที่จองไว้ (น้อยอยู่ซ้าย)

- แถบด้านบน: browse 10, checkout 30, delivery 40, shop 50, account 90 ถึง 99 ไอคอนตะกร้าไม่อยู่ในรายการนี้ `SiteHeader` วาดเองนอกเมนูด้วย `cartCount` กับ `cartLabel` จาก `src/features/cart/nav.ts` เพราะต้องเห็นทุกขนาดจอ
- เมนูหลังบ้าน: product-listing 10, stock 20, shop-orders 30, shop 40 (ตั้งค่าร้าน) และ 50 (หน้าร้าน)

## เพิ่มหน้า

1. สร้าง `src/app/<ที่อยู่>/page.tsx` ตามตารางข้างบน
2. หน้าอ่านข้อมูลผ่านฟังก์ชันใน `server/` เท่านั้น lint ห้ามเรียก `db.prepare` ในหน้า

```tsx
import { listCartItems } from "@/features/cart/server/cart";
import { getDb } from "@/shared/db";
import { requireAccount } from "@/shared/session";
import { EmptyState } from "@/shared/ui/states";

export default async function CartPage() {
  const viewer = await requireAccount("/cart");
  const items = listCartItems(getDb(), viewer.id);
  if (items.length === 0) return <EmptyState title="ตะกร้ายังว่าง" />;
  // ...
}
```

- ทุกหน้าเรนเดอร์ใหม่ทุกครั้งที่มีคนเปิด (ตั้งไว้ที่ `src/app/layout.tsx`) ไม่ต้องตั้ง cache เอง
- ฟอร์มส่งไปที่ server action ใน `src/features/<feature>/actions.ts` หรือ `<เรื่อง>-actions.ts` ของ feature นั้น แล้ว action เรียกฟังก์ชันใน `server/` ฟอร์มที่ต้องรอผลใช้ `ActionForm` หรือ `withTimeout` จาก `src/shared/ui/` เพื่อให้ได้ "ไม่สำเร็จ" เมื่อเกิน 10 วินาที
- ข้อมูลไม่มีหรือเป็นของคนอื่น ให้เรียก `notFound()` จาก `next/navigation` ทั้งสองกรณี จะได้หน้า "ไม่พบ" แบบเดียวกัน
- หน้ากำลังโหลด ใช้ `loading.tsx` ที่คืน `<LoadingState />` หรือ `<Suspense fallback={<LoadingState />}>` ถ้า requirement บอกว่าเกิน 10 วินาทีถือว่าโหลดไม่สำเร็จ ห่อด้วย `<LoadingTimeout>`
- หน้าผิดพลาด ใช้ `<ErrorState />` ปุ่ม "ลองใหม่" โหลดข้อมูลหน้าเดิมใหม่โดยคงที่อยู่หน้าเว็บไว้
- ไลบรารีที่ใช้ได้เฉพาะในเบราว์เซอร์ (อ่าน `window` `self` หรือ `customElements` ตอนโหลด) ให้โหลดด้วย `import()` ใน `useEffect` ของ client component ไม่ import ไว้บนสุดของไฟล์ เพราะ client component ยังถูกเรนเดอร์บนเซิร์ฟเวอร์ก่อน และไลบรารีจะถูกโหลดเมื่อ component นั้นแสดงเท่านั้น แบบอย่างคือ `ProductModel` ใน `src/features/browse/components/product-model.tsx` ชนิดของ custom element ที่ใช้ใน JSX ประกาศในไฟล์ `.d.ts` แบบ `model-viewer.d.ts` ข้างกัน ให้ประกาศทุก attribute ที่ใช้ รวมถึงชื่อที่มีขีดกลาง เพราะ TypeScript ไม่เตือนชื่อที่มีขีดกลางที่ไม่ได้ประกาศ
- หน้าและ layout ฝั่งเซิร์ฟเวอร์ import ได้เฉพาะ component จากไฟล์ที่ขึ้นต้นด้วย `"use client"` ค่าอื่นเช่นข้อความหรือค่าคงที่ที่ import มาจะไม่มีค่าจริงฝั่งเซิร์ฟเวอร์ ให้ย้ายค่าไปไว้ในไฟล์ที่ไม่ใช่ client เช่น `server/`
- สไตล์กลาง (`button` `button-secondary` `link-action` `field` `input` `field-error` `chips` `chip` `visually-hidden`) อยู่ใน `src/app/globals.css` สไตล์เฉพาะ feature ให้เขียน `*.module.css` ในโฟลเดอร์ feature ไม่แก้ globals.css สี ขนาด ระยะ และกฎหน้าตาอยู่ใน `docs/design-system.md` อ่านก่อนเขียน CSS
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

## งานที่ทำเองตามเวลา

งานที่ต้องเกิดตามเวลาโดยไม่มีใครเปิดหน้าเว็บ เช่นยกเลิกคำสั่งซื้อที่ไม่จ่ายภายใน 30 นาที ใช้ `setInterval` ในโปรเซสของแอปเอง แอปมีโปรเซสเดียว จึงไม่มี cron หรือคิวงานแยก

- เริ่มงานใน `register()` ของ `src/instrumentation.ts` ซึ่ง Next.js เรียกครั้งเดียวตอนเปิดเซิร์ฟเวอร์ ทั้ง `pnpm dev` และ `pnpm start` เพิ่มงานใหม่ได้ด้วยบรรทัดเดียวในนั้น
- ตัวงานเป็นฟังก์ชันใน `server/` ที่รับ `db` และ `now` test จึงเรียกตรงได้
- รันครั้งแรกทันทีตอนเริ่ม เพื่อจัดการสิ่งที่ครบเวลาระหว่างที่แอปปิดอยู่ แล้วรันซ้ำทุกช่วงที่สั้นกว่าความคลาดเคลื่อนที่ requirement ยอม
- รอบที่พังให้ log แล้วรอรอบถัดไป แอปไม่ล่ม และกันการเริ่มซ้ำด้วยค่าบน `globalThis` เพราะ next dev โหลดโมดูลใหม่บ่อย
- แบบอย่างคือ `startPaymentDeadlineTimer` ใน `src/features/checkout/server/order-groups.ts` ตรวจหมดเวลาจ่ายเงินทุก 15 วินาที (CHK-Q03 ยอม 1 นาที)
- กฎที่ต้องเป็นจริงตรงเวลาเป๊ะ อย่ารอแค่รอบตรวจ ให้ตรวจเวลาเองตอนทำรายการด้วย เช่น `checkOrderGroupPayable`

## สั่งซื้อ จองสต็อก และกลุ่มคำสั่งซื้อ

กด "สั่งซื้อ" ที่ `/checkout` สร้างหนึ่งคำสั่งซื้อต่อร้านในกลุ่มคำสั่งซื้อเดียว จองสต็อก เอารายการออกจากตะกร้า แล้วพาไป `/pay/[groupId]`

- หน้าสั่งซื้ออ่านแถว `cart_items` ที่ `selected = 1` ของผู้ซื้อ และที่อยู่จาก `shipping_addresses` เลือกที่อยู่หลักไว้ให้ก่อน ยกเว้นมาจากหน้าเพิ่มที่อยู่ด้วย `/checkout?addressId=` ซึ่งเลือกที่อยู่นั้นแทน
- `variants.stock` คือจำนวนที่ยังขายได้ หักจำนวนที่จองอยู่ออกแล้ว คำสั่งซื้อเปลี่ยนเป็น `จ่ายแล้ว` ไม่ต้องทำอะไรกับสต็อก
- test ที่ต้องมีคำสั่งซื้อที่จองสต็อกจริงให้เรียก `placeOrder` เพราะ `addOrder` ใน builders ไม่ตัดสต็อก test ที่ต้องกดพร้อมกันจริงดูแบบอย่างที่ `src/features/checkout/server/checkout.race.test.ts`
- ลองหน้าสั่งซื้อด้วย curl: `pnpm tsx scripts/fill-cart.ts buyer1@example.com` ใส่ของ 3 ชิ้นจาก 2 ร้านลงตะกร้าและเพิ่มที่อยู่หลักให้
- สคริปต์ที่เขียนคำสั่งซื้อด้วย `addOrder` ไม่จองสต็อก ห้ามสร้างคำสั่งซื้อ `รอจ่ายเงิน` ด้วยวิธีนี้ในฐานข้อมูลของแอป เพราะพอหมดเวลาระบบจะคืนสต็อกที่ไม่เคยจอง ถ้าต้องการให้ทำผ่าน `placeOrder` แบบ `src/shared/seed/orders.ts`

ฟังก์ชันที่ feature อื่นเรียกได้

| ฟังก์ชัน | อยู่ที่ | ใช้ตอนไหน |
|---|---|---|
| `getOrderGroup(db, groupId, buyerId)` | `checkout/server/order-groups.ts` | อ่านกลุ่มคำสั่งซื้อพร้อมยอดรวม `total` เวลาหมดเขต `paymentDeadline` และยอดของแต่ละร้าน ได้ null ถ้าไม่มีหรือเป็นของบัญชีอื่น |
| `checkOrderGroupPayable(db, groupId, buyerId, now)` | `checkout/server/order-groups.ts` | ก่อนพาไปจ่ายเงินหรือก่อนเริ่มการจ่ายเงิน ครบ 30 นาทีแล้วจ่ายไม่ได้ทันที ได้ `reason: "expired"` ให้แสดง `PAYMENT_EXPIRED_MESSAGE` |
| `cancelAwaitingPaymentGroup(db, groupId, reason, now)` | `checkout/server/order-groups.ts` | ยกเลิกทุกคำสั่งซื้อในกลุ่มที่ยัง `รอจ่ายเงิน` พร้อมคืนสต็อกและเปลี่ยนการจ่ายเงินที่ `รอผล` เป็น `เลิกรอ` ผู้ซื้อยกเลิก (`cancelOrderGroup`) และหมดเวลาจ่ายเงินใช้ตัวนี้ ได้ 0 ถ้าจ่ายแล้วหรือถูกยกเลิกไปก่อน |
| `expireOverdueOrderGroups(db, now)` | `checkout/server/order-groups.ts` | ยกเลิกทุกกลุ่มที่เลยเวลาจ่ายเงิน รอบตรวจเรียกทุก 15 วินาที และหน้าคำสั่งซื้อกับหน้าจ่ายเงินเรียกก่อนอ่าน ผู้ซื้อจึงเห็น `ยกเลิก` ทันที |
| `releaseCancelledOrderStock(db, orderId, now)` | `stock/server/reservation.ts` | หลังเปลี่ยนคำสั่งซื้อเป็น `ยกเลิก` เอง เช่นพัสดุ `ส่งไม่สำเร็จ` (`changeParcelStatus` เรียกให้แล้ว) คืนสต็อกครั้งเดียวต่อคำสั่งซื้อ เรียกซ้ำได้ |
| `createParcelForPaidOrder(db, orderId, now)` | `delivery/server/parcel-status.ts` | `markGroupPaid` ของการจ่ายเงินเรียกให้ทุกคำสั่งซื้อที่เพิ่งเป็น `จ่ายแล้ว` ในการบันทึกเดียวกัน เรียกซ้ำได้ |
| `countOrdersAwaitingPacking(db, shopId)` | `shop-orders/server/orders.ts` | ตัวนับ "รอจัดของ" ตัวเดียวของทั้งระบบ นับไม่ได้ให้แสดง `UNCOUNTED` ("–") |
| `reservedQuantity(db, variantId)` | `stock/server/reservation.ts` | จำนวนที่จองอยู่ของแบบย่อย |

เหตุผลการยกเลิกใช้ `CANCEL_REASON` ใน `order-groups.ts` ("ผู้ซื้อยกเลิก" "หมดเวลาจ่ายเงิน" "ส่งไม่สำเร็จ")

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
import { getCurrentAccount, requireAccount, type CurrentAccount } from "@/shared/session";

const viewer: CurrentAccount | null = await getCurrentAccount();
// { id, email, displayName, isAdmin, shopId: number | null } หรือ null ถ้ายังไม่เข้าสู่ระบบ

// หน้าที่ต้องเข้าสู่ระบบ: ได้บัญชีเลย หรือถูกพาไป /login?next=/orders/123 แล้วกลับมาหน้านี้หลังเข้าสู่ระบบ
const buyer: CurrentAccount = await requireAccount(`/orders/${orderNo}`);
```

- ใช้ได้ใน server component, server action และ route handler เรียกกี่ครั้งในคำขอเดียวก็อ่านฐานข้อมูลครั้งเดียว
- อ่าน token จาก cookie `bs_session` แล้วหาในตาราง `sessions` คืน null ถ้าหมดอายุ (ไม่ได้ใช้เกิน 30 วัน) หรือบัญชีถูกระงับ ทุกครั้งที่ใช้จะต่ออายุอีก 30 วัน
- `requireAccount(next)` ใส่ที่อยู่ของหน้านั้นเองเป็น `next` ใส่ query ได้ เช่น `"/checkout?step=2"` เขียน `redirect("/login?next=/cart")` เองก็ได้ผลเหมือนกัน
- หน้าเข้าสู่ระบบดู cookie เองว่าเครื่องนี้หมดอายุหรือบัญชีถูกระงับ แล้วขึ้นข้อความให้ ไม่ต้องส่งเหตุมาด้วย
- อยากให้หน้าเข้าสู่ระบบขึ้นข้อความเพิ่ม ใช้ `loginPath(next, notice)` จาก `@/features/account/server/login-path` notice มี `"relogin"` (กรุณาเข้าสู่ระบบอีกครั้ง) และ `"password-reset"` (ตั้งรหัสผ่านใหม่แล้ว กรุณาเข้าสู่ระบบ) เช่นตั้งรหัสผ่านใหม่สำเร็จให้ `redirect(loginPath("/", "password-reset"))`
- ถ้าลบแถวใน `sessions` ของบัญชีหนึ่ง ทุกเครื่องของบัญชีนั้นจะออกจากระบบในครั้งถัดไปที่เปิดหน้า
- ถ้าเลิกระงับบัญชี ให้ลบแถวใน `sessions` ของบัญชีนั้นด้วย เพราะตอนระงับ ระบบเก็บแถวไว้ให้หน้าเข้าสู่ระบบบอกว่าถูกระงับ ถ้าไม่ลบ เครื่องเก่าจะกลับมาอยู่ในระบบเอง
- โมดูลใน `server/` ไม่เรียก `getCurrentAccount()` ให้หน้าหรือ action ส่ง `viewer.id` เข้าไปแทน
- หน้าที่ redirect ระหว่างเรนเดอร์ได้สถานะ 200 พร้อม meta refresh ไม่ใช่ 307 เพราะ `src/app/loading.tsx` ทำให้หน้าเริ่มส่งออกไปก่อน เบราว์เซอร์ยังพาไปหน้าเข้าสู่ระบบโดยไม่แสดงข้อมูลของหน้านั้น ตอนลองด้วย curl ให้ดูคำว่า `NEXT_REDIRECT` ในเนื้อหน้า

### ทำเป็นบัญชีที่เข้าสู่ระบบอยู่ ตอน test และตอนลองแอป

- test ของโมดูลใน `server/` ส่ง `account.id` จาก `addAccount(db)` เข้าฟังก์ชันได้เลย ถ้าฟังก์ชันรับ `CurrentAccount` ทั้งก้อน ใช้ `findAccountBySessionToken(db, addSession(db, account.id))` จาก `@/features/account/server/sessions` จะได้ `shopId` และ `isAdmin` ตรงกับฐานข้อมูล
- test ของหน้าหรือ server action ลอกส่วน `vi.mock` ที่ต้นไฟล์ `src/features/account/account-pages.test.tsx` ไปใช้ ส่วนนั้นจำลอง cookie และให้ `getDb()` คืนฐานข้อมูลของ test แล้วเรียก `signInAs(accountId)` ในไฟล์เดียวกันเป็นแบบอย่าง
- ลองแอปที่รันอยู่ด้วย curl: `curl -b "$(pnpm -s tsx scripts/login-as.ts buyer1@example.com)" http://localhost:3200/cart` สคริปต์สร้างการเข้าสู่ระบบในฐานข้อมูลของ worktree นั้นแล้วพิมพ์ cookie ออกมา

## ข้อมูลตัวอย่าง

`pnpm seed` สร้าง 12 หมวดหมู่ 50 ร้าน 1,000 สินค้าที่ขายอยู่ พร้อมแบบย่อย สต็อก และประวัติสต็อก บัญชีผู้ดูแลแพลตฟอร์ม 1 บัญชี ผู้ขาย 50 บัญชี และผู้ซื้อ 3 บัญชี (อีเมลและรหัสผ่านอยู่ใน README) และคำสั่งซื้อตัวอย่าง 8 รายการของร้าน seller01 ครบทุกสถานะ ที่สร้างผ่านกฎจริง (`src/shared/seed/orders.ts`) รูปสินค้าเป็นรูปถ่ายจริงจาก `src/shared/seed/photos/` เลือกตามคำนามในชื่อสินค้า (`SAMPLE_PHOTOS` ใน `catalog.ts`) และเก็บแบบรูปที่ร้านนั้นส่งขึ้นมาเอง เปิดที่ `/product-images/<key>` ที่มาและสัญญาอนุญาตอยู่ใน `photos/SOURCES.txt` ใช้เฉพาะ CC0 หรือสาธารณสมบัติ ชื่อที่ยังไม่มีรูปถ่ายและโลโก้ร้านเป็น SVG ที่สร้างจากชื่อไฟล์ที่ `/sample-images/<ชื่อ>.svg` สินค้า 2 ชิ้นของร้านแรกมีไฟล์ 3 มิติจาก `src/shared/seed/models/` (ที่มาและสัญญาอนุญาตอยู่ใน `SOURCES.txt` ข้างไฟล์ ใช้เฉพาะไฟล์ CC0)

ระบบรู้ว่าเคยสร้างแล้วจากบัญชี `admin@example.com` จึงรันซ้ำได้ ถ้าต้องเพิ่มข้อมูลตัวอย่าง ให้แก้ `src/shared/seed/index.ts` และ test ใน `seed.test.ts`
