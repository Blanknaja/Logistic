# โครงสร้างระบบดีไซน์ของ ikea.com (วัดจากเว็บจริง)

เอกสารนี้จดโครงสร้างระบบดีไซน์ที่ ikea.com ใช้ เพื่อให้ทีม Blanksong สร้างระบบของตัวเองด้วยวินัยแบบเดียวกัน
เรายืม **โครงสร้าง** (สเกล อัตราส่วน กฎ) ไม่ยืม **ตัวตนแบรนด์** (สีน้ำเงิน/เหลืองของ IKEA ฟอนต์ Noto IKEA โลโก้ ราคาแบบ BTI สีเหลือง)

## วิธีวัดและข้อจำกัด

- วันที่วัด: 2026-11-25
- เครื่องมือ: Chrome ที่ติดตั้งในเครื่อง เปิดแบบ headless ผ่าน Playwright (ต่อ Chrome extension ไม่ได้ 3 ครั้ง จึงใช้วิธีนี้แทน) ยังได้ค่า `getComputedStyle` จริงจากหน้าเว็บ
- ขนาดจอ: desktop `1440×900` และ mobile `390×900`
- ไม่ได้กดยอมรับหรือปฏิเสธ cookie banner ไม่ได้ล็อกอิน ไม่ได้ใส่ของลงตะกร้า
- เว็บ headless อาจเห็นต่างจากผู้ใช้จริงได้ (เช่น A/B test หรือเนื้อหาตามฤดูกาล) ค่าที่จดคือค่าที่เห็นในวันที่วัด

### ตัวย่อแหล่งข้อมูล

| ตัวย่อ | หน้า | URL |
|---|---|---|
| PIP | หน้าสินค้า | https://www.ikea.com/sg/en/p/tingby-side-table-on-castors-grey-70349445/ |
| HOME | หน้าแรก | https://www.ikea.com/sg/en/ |
| PLP | หน้าหมวดสินค้า | https://www.ikea.com/sg/en/cat/side-tables-10717/ |
| SEARCH | ผลค้นหา | https://www.ikea.com/sg/en/search/?q=side%20table |
| CART | ตะกร้า | https://www.ikea.com/sg/en/shoppingcart/ |

### ตัวย่อวิธีวัด

| ตัวย่อ | ความหมาย |
|---|---|
| `CS` | อ่าน `getComputedStyle()` ของ element ตาม selector ที่ระบุ |
| `RULE` | อ่านข้อความ rule จาก `document.styleSheets` ตาม selector ที่ระบุ |
| `VAR` | ไล่หา CSS custom property ทุกตัวใน `document.styleSheets` แล้วอ่านค่าจริงที่ `:root` |
| `COUNT` | นับทุก element ที่มองเห็นในหน้า (ที่ 1440) ว่าใช้สีหรือขนาดตัวอักษรอะไรกี่ครั้ง |
| `@1440` / `@390` | วัดที่จอกว้าง 1440 หรือ 390 px |

ตัวอย่างการอ้างอิง: "PIP `CS .pipf-btn__inner` @1440" แปลว่าวัดจากหน้าสินค้า ด้วย `getComputedStyle` ของ `.pipf-btn__inner` ที่จอ 1440

---

## 1. ภาพรวมโครงสร้าง

- ระบบชื่อ **Skapa** ตัวแปรขึ้นต้นด้วย `--skapa-` และ `--colour-` (PIP `VAR` พบตัวแปรทั้งหมด 404 ตัว รวมของ library ภายนอก เช่น `--tw-` ด้วย)
- ทุก component บอกชื่อและเวอร์ชันไว้ใน attribute เช่น `data-skapa="button@19.0.27"`, `price@6.1.0`, `quantity-stepper@11.1.6` (PIP, PLP, HOME, SEARCH: นับ `[data-skapa]`)
- แต่ละทีมใช้ component ชุดเดียวกันแต่ใส่ prefix ของตัวเอง: `hnf-` (header/footer), `pipf-`/`pipcom-` (หน้าสินค้า), `plp-` (หมวดและค้นหา), `pub-` (หน้าแรก) ทำให้ปุ่มทุกทีมหน้าตาเหมือนกันแม้มาจากคนละแอป (PIP `RULE .hnf-btn__inner` กับ `RULE .pipf-btn__inner` ค่าเหมือนกัน: `min-height: 3.5rem; padding: 0 2rem; border-radius: 64px`)
- ในหน้าเดียวมีปุ่มหลายเวอร์ชันพร้อมกันได้ เช่น `button@19.0.22`, `19.0.27`, `19.0.28` บนหน้า PIP เดียวกัน (PIP นับ `[data-skapa]`)
- **สี** เก็บเป็นตัวแปร runtime แบบเลข RGB สามตัว เช่น `--colour-neutral-7: 17, 17, 17` แล้วใช้ผ่าน `rgb(var(--x))` หรือ `rgba(var(--x), .15)` เพื่อปรับความโปร่งได้ (PIP `VAR`)
- **ระยะห่าง** ไม่มีตัวแปร runtime เลย ค่าเป็นเลข `rem` ที่ถูก compile มาแล้ว (PIP `VAR` ไม่พบตัวแปร spacing) มีหลักฐานว่า token เขียนด้วย Sass: rule `.pipf-btn` มีค่าหลุดมาเป็น `--background: tokens.$colour-interactive-primary-bg-default` (PIP `RULE .pipf-btn`)
- มีธีมมืดแบบสลับด้วย class `.theme-dark` ไม่ใช่ `prefers-color-scheme` (PIP+PLP `RULE` พบ `--colour-neutral-1: 17, 17, 17` ใน `.theme-dark` และ `prefers-color-scheme` 0 ครั้ง) ไม่เห็นธีมมืดเปิดใช้บนหน้าที่วัด

## 2. สี

### 2.1 บทบาทของสี (ธีมสว่าง)

ทั้งหมดจาก PIP `VAR` (ค่าที่ `:root`) และยืนยันการใช้จริงด้วย `CS`

| บทบาท | ตัวแปร | ค่า | ใช้จริงที่ไหน (หลักฐาน) |
|---|---|---|---|
| ตัวอักษรหลัก (หัวข้อ ชื่อสินค้า ราคา) | `--colour-text-and-icon-1` | `#111111` | PIP `CS h1`, `CS .pipcom-price__integer` |
| ตัวอักษรเนื้อหา | `--colour-text-and-icon-2` | `#484848` | PIP `CS body` สี `rgb(72,72,72)` |
| ตัวอักษรรอง | `--colour-text-and-icon-3` | `#767676` | `RULE .hnf-link--grey` |
| ตัวอักษรจาง/ปิดใช้ | `--colour-text-and-icon-4` | `#929292` | PIP `COUNT` พบ 2 จุด |
| ตัวอักษรบนพื้นเข้ม | `--colour-text-and-icon-5` | `#ffffff` | PIP `CS .pipf-btn__inner` (ปุ่ม Add to cart) |
| พื้นหลังหน้า | `--colour-neutral-1` | `#ffffff` | PIP `CS body` |
| พื้นผิวรอง (search, tile, footer, pill) | `--colour-neutral-2` | `#f5f5f5` | PIP `CS .search-box-search`, `CS footer`; HOME `CS .hnf-inpage-nav__card` |
| เส้นแบ่ง ขอบการ์ด skeleton | `--colour-neutral-3` | `#dfdfdf` | PLP `CS .plp-choice-item__border`; HOME `CS .hri-skeleton` |
| ขอบช่องกรอก/stepper/checkbox | `--colour-interactive-subtle-border-default` | `#929292` | PIP `CS .pipf-quantity-stepper__border`; PLP `CS .plp-checkbox__symbol` |
| ปุ่มหลัก (ทั่วไป) | `--colour-interactive-primary-bg-default` / hover / pressed | `#111111` / `#333333` / `#000000` | HOME `CS .pub__carousel__button .pub__btn__inner` |
| ปุ่มเน้น (ซื้อ) | `--colour-interactive-emphasised-bg-default` / hover / pressed | `#0058a3` / `#004f93` / `#003e72` | PIP `CS` ปุ่ม Add to cart |
| ปุ่มรอง | `--colour-interactive-secondary-bg-default` / hover / pressed | `#f5f5f5` / `#dfdfdf` / `#cccccc` | PLP `RULE .plp-pill` |
| ปุ่มลบ/อันตราย | `--colour-interactive-destructive-bg-default` | `#e00751` | `RULE .hnf-btn--danger` |
| ปิดใช้ | `--colour-interactive-disabled-1` / `-2` | `#cccccc` / `#929292` | `RULE .hnf-btn` (`--disabled-background`, `--disabled-foreground`) |
| สำเร็จ / มีของ | `--colour-semantic-positive` | `#0a8a00` | PIP `CS .lower-funnel-fragments-status__dot` |
| เตือน | `--colour-semantic-caution` / `-caution-text` | `#f26a2f` / `#ca5008` | PIP `VAR` |
| ผิดพลาด | `--colour-semantic-negative` | `#e00751` | `RULE .hnf-validation-border--error` |
| ข้อมูล | `--colour-semantic-informative` | `#0058a3` | PIP `VAR` |
| ป้าย "New" | `--colour-commercial-message-new` | `#ca5008` | PLP `CS .plp-commercial-message--subtle--new` |
| ราคาสมาชิก | `--colour-commercial-message-ikea-family` | `#007cc1` | PLP `CS .plp-price--family` |
| พื้นหลังรูปสินค้า (thumbnail) | ไม่มีตัวแปร | `#efefef` | PIP `CS .pipf-product-gallery__thumbnail` |
| แถบบนสุด | `--colour-static-black` | `#111111` | PIP `CS .hnf-utilitybar` |
| ฉากหลังตอนเปิด dialog | `--colour-static-black` + alpha | `rgba(17,17,17,.4)` | `RULE .hnf-modal-wrapper__backdrop--dark` |

### 2.2 เทามีแค่ 7 ระดับ (+1)

- `--colour-neutral-1` ถึง `-7`: `#ffffff`, `#f5f5f5`, `#dfdfdf`, `#cccccc`, `#929292`, `#484848`, `#111111` (PIP `VAR`)
- มีเทาเพิ่มอีกตัวสำหรับตัวอักษรรอง `#767676` (`--colour-text-and-icon-3`, `--colour-static-dark-grey`)
- ไม่ใช้ดำสนิท `#000` เป็นสีตัวอักษร ดำที่ใช้คือ `#111111` (PIP `VAR`)

### 2.3 สีเน้นใช้น้อยมาก (นับจริง)

`COUNT` นับ element ที่มีพื้นหลัง `rgb(0, 88, 163)` (สีปุ่มเน้น):

| หน้า | จำนวน | คืออะไร |
|---|---|---|
| PIP | 1 | ปุ่ม Add to cart อันเดียว |
| HOME | 0 | ไม่มีเลย |
| PLP | 24 | ปุ่มใส่ตะกร้า 1 ปุ่มต่อการ์ด (24 การ์ด) |
| SEARCH | 22 | ปุ่มใส่ตะกร้า 1 ปุ่มต่อการ์ด |

สีตัวอักษรที่นับได้ (`COUNT`) เกือบทั้งหมดเป็นเทาสองตัว:
- PIP: `#484848` 79 ครั้ง, `#111111` 51 ครั้ง, ขาว 11, อื่นๆ 3
- PLP: `#111111` 263, `#484848` 172, ขาว 8, ฟ้าราคาสมาชิก 7, ส้ม "New" 2

### 2.4 ชุดสีอื่น

- `--colour-extended-palette-01` ถึง `-21` (21 สี) สำหรับงานแคมเปญ/ภาพประกอบ ไม่ได้ใช้กับ UI หลัก (PIP `VAR`)
- `--colour-elevation-1` (`#fff` ขอบ `#dfdfdf`), `--colour-elevation-2` (`#fff` ขอบ `#484848`), `--colour-elevation-3` (`#111`) ใช้แทนเงาสำหรับชั้นที่ลอยขึ้นมา (PIP `VAR`; `RULE .hnf-sheets`, `.hnf-toast`)

## 3. ตัวอักษร

### 3.1 Font

- `--ikea-font`: `"Saudi Riyal", "Noto IKEA", "Noto Sans JP", "Noto Sans KR", "Noto Sans SC", "Noto Sans TC", "Noto Sans", "Roboto", "Open Sans", system-ui, sans-serif` (PIP `VAR`, `CS body`)
- โหลดแค่ 2 น้ำหนัก: `400` และ `700` (แบบตรงและเอียง) ใช้ `font-display: swap` (PIP `RULE` ใน `fonts.*.css`)
- ทุก typography class บังคับน้ำหนักด้วย `clamp(400, var(--skapa-font-weight), 700)` (PIP `RULE [class^="hnf-typography-"]`)
- ขนาดฐาน `html` = `16px`, `body` = `0.875rem` (14px) `line-height: 1.571` (PIP `RULE body`, `CS body` ได้ 14px / 21.994px)

### 3.2 สเกลขนาด (หน่วย px)

ขนาดเป็นตัวเลขไม่มีหน่วยในตัวแปร แล้วคำนวณ `font-size: calc(1rem * var(--skapa-base-multiplier) * var(--skapa-font-size) / 16)` (PIP `RULE [class^="hnf-typography-"]`)

มี 3 ชุดขนาด (typescale) ชุด `auto` สลับเองตามจอ: ต่ำกว่า 600px ใช้ `small-screen`, ตั้งแต่ `37.5em` (600px) ใช้ `desktop`, ตั้งแต่ `75em` (1200px) ใช้ `large-screen` (PIP `RULE @media (min-width: 37.5em) { .hnf-typography-typescale-auto }` และ `75em`)

| Role | small-screen | desktop | large-screen | weight | line-height |
|---|---|---|---|---|---|
| `display-xl` | 48 | 72 | 144 | 700 | 1.2 |
| `display-l` | 36 | 56 | 96 | 700 | 1.2 |
| `display-m` | 28 | 40 | 64 | 700 | 1.2 |
| `heading-xl` | 24 | 32 | 40 | 700 | 1.25 |
| `heading-l` | 20 | 24 | 28 | 700 | 1.25 |
| `heading-m` | 18 | 18 | 18 | 700 | 1.25 |
| `heading-s` | 16 | 16 | 16 | 700 | 1.25 |
| `heading-xs` | 14 | 14 | 14 | 700 | 1.25 |
| `statement-l` | 20 | 28 | 40 | 400 | 1.5 |
| `statement-m` | 18 | 20 | 28 | 400 | 1.5 |
| `body-l` | 16 | 16 | 16 | 400 | 1.5 |
| `body-m` | 14 | 14 | 14 | 400 | 1.5 |
| `body-s` | 12 | 12 | 12 | 400 | 1.8 |
| `label-l` | 16 | 16 | 16 | 700 | 1.25 |
| `label-m` | 14 | 14 | 14 | 700 | 1.25 |
| `label-s` | 12 | 12 | 12 | 700 | 1.25 |
| `label-xs` | 10 | 10 | 10 | 700 + `uppercase` | 1.25 |
| `caption-l` / `-m` / `-s` | 16 / 14 / 12 | เท่าเดิม | เท่าเดิม | 400 | 1.25 / 1.25 / 1.5 |

ที่มา: PIP `RULE .hnf-typography-typescale-small-screen`, `-desktop`, `-large-screen`, และ `RULE .hnf-typography-body-l` ถึง `.hnf-typography-label-xs`

สังเกต: ขนาดเนื้อหา (body, label, caption) **ไม่เปลี่ยน** ตามจอ เปลี่ยนแค่หัวข้อใหญ่ (display, heading-xl, heading-l, statement)

ยืนยันกับหน้าจริง: หัวข้อ `heading-xl` ได้ 40px @1440 และ 24px @390 (HOME `CS h1`, PLP `CS h1`), `heading-l` ได้ 28px @1440 และ 20px @390 (HOME `CS .pub__typography-heading-l`)

ตัวคูณฐาน `--skapa-base-multiplier`: `base-14` = 1, `base-16` = 16/14, `base-20` = 20/14, `base-28` = 2, `base-56` = 4 (PIP `RULE .hnf-typography-base-*`)

### 3.3 Letter-spacing คิดจากสูตร

`letter-spacing = (weight / 800 − 0.125) × (14px − ขนาดตัวอักษร) / 14` (PIP `RULE [class^="hnf-typography-"]` ใช้ `--skapa-letter-spacing-multiplier-for-font-weight`)

แปลว่า ตัวใหญ่และหนา → ชิดกันขึ้น, ตัวเล็กกว่า 14px → ห่างออกเล็กน้อย, ภาษา CJK/อาหรับ/ฮีบรู ปิดสูตรนี้ (`--skapa-characterset-multiplier: 0`)

ค่าที่วัดได้ตรงกับสูตร:
- 40px/700 → `-1.39286px` (PLP `CS h1` @1440)
- 16px/700 → `-0.107143px` (PIP `CS h1`)
- 16px/400 → `-0.0535714px` (PIP `CS .pipcom-price-module__description`)
- 12px/700 → `+0.107143px` (PIP `CS` label ของปุ่ม All media)

### 3.4 ขนาดที่ใช้จริงตามบทบาท

| บทบาท | ค่า (size / weight / line-height / สี) | หลักฐาน |
|---|---|---|
| ชื่อสินค้า หน้า PIP | 16 / 700 / 20px / `#111` (`heading-s`) | PIP `CS .pipcom-price-module__name-decorator` @1440 และ @390 |
| คำอธิบายสินค้า หน้า PIP | 16 / 400 / 20px / `#111` (`label-l` regular) | PIP `CS .pipcom-price-module__description` |
| ราคา หน้า PIP | ตัวเลข 32 / 700 / 32px; สกุลเงินและทศนิยม 16 / 700 | PIP `CS .pipcom-price__integer`, `__currency`, `__decimal` |
| ชื่อสินค้า บนการ์ด PLP | 14 / 700 / 17.5px / `#111` | PLP `CS .plp-price-module__name-decorator` |
| คำอธิบาย บนการ์ด PLP | 14 / 400 / 17.5px / `#111` | PLP `CS .plp-price-module__description` |
| ราคา บนการ์ด PLP | ตัวเลข 28 / 700; สกุลเงินและทศนิยม 14 / 700 | PLP `CS .plp-price__integer`, `__currency` |
| ชื่อสินค้า บนการ์ดหน้าแรก | 12 / 700 / 15px | HOME `CS .pipcom-price-module__name-decorator` |
| ราคา บนการ์ดหน้าแรก | 24 / 700 | HOME `CS .pipcom-price-module__current-price` |
| เนื้อหาทั่วไป | 14 / 400 / 1.571 / `#484848` | PIP `CS body` |
| breadcrumb, จำนวนรายการ | 12 / 400 / 18px / `#484848` | PIP `CS .hnf-breadcrumb__link`; PLP `CS .plp-filter-information__total-count` |
| หัวข้อย่อยในกล่องซื้อ ("How to get it") | 14 / 700 / 17.5px (`heading-xs`) | PIP `CS h2.lower-funnel-fragments-typography-heading-xs` |
| ข้อความสถานะ (In stock) | 14 / 400 / `#484848` | PIP `CS .lower-funnel-fragments-status__label` |
| ข้อความปุ่มใหญ่ (56px) | 14 / 700 (`label-m`) | PIP `CS .pipf-btn__inner` ของ Add to cart |
| ข้อความปุ่มเล็ก (40px) และ pill | 12 / 700 (`label-s`) | PIP `CS` ปุ่ม All media; PLP `CS .plp-pill__label` @390 |
| ช่องค้นหา | 16 / 400 / `#111` | PIP `CS .search-box-search__input` @1440 และ @390 |
| หัวข้อหน้าค้นหา | 24 / 400 (`heading-l` regular) | SEARCH `CS h1.search-summary__heading` |

`COUNT` ขนาด/น้ำหนักที่ใช้บ่อยสุดบน PLP: `14px/400` 191 ครั้ง, `14px/700` 109, `12px/400` 57, `28px/700` 48 (ราคา)

## 4. ระยะห่าง กริด และ breakpoint

### 4.1 Spacing scale

ไม่มี token แบบ runtime ต้องนับจากค่าใน CSS (PIP+PLP `RULE` นับค่า `padding`, `margin`, `gap` ทั้งหมด) ค่าที่ใช้บ่อยสุด:

| ค่า | px | จำนวนครั้ง |
|---|---|---|
| `1rem` | 16 | 1400 |
| `0.5rem` | 8 | 1101 (+51 แบบ `.5rem`) |
| `1.5rem` | 24 | 848 |
| `0.25rem` | 4 | 641 |
| `2rem` | 32 | 497 |
| `0.75rem` | 12 | 472 |
| `1.25rem` | 20 | 292 |
| `2.5rem` | 40 | 142 |
| `3rem` | 48 | 78 |
| `4rem` | 64 | 50 |

สรุป: หน่วยฐาน 4px สเกลหลักคือ 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 ค่านอกสเกล (เช่น 6px, 3px, 21.5px) มีน้อยมาก

### 4.2 ระยะขอบหน้า (gutter) และความกว้างสูงสุด

| ช่วงจอ | padding ซ้ายขวา | หลักฐาน |
|---|---|---|
| ต่ำกว่า 600px | `1.25rem` (20px) | `RULE .hnf-content-container`; PIP `CS` @390 ได้ `0 20px` |
| 600–899px | `2rem` (32px) | `RULE @media (min-width: 37.5em) .hnf-content-container` |
| 900px ขึ้นไป | `3rem` (48px) | `RULE @media (min-width: 56.25em)`; PIP `CS` @1440 ได้ `0 48px` |

ความกว้างเนื้อหาสูงสุด `max-width: 112rem` (1792px) จัดกลางด้วย `margin-inline: auto` (`RULE .hnf-content-container`)

### 4.3 กริด

| ช่วงจอ | คอลัมน์ | ช่องว่าง | หลักฐาน |
|---|---|---|---|
| ต่ำกว่า 600px | 4 | 12px | `RULE .pipf-page` (`--grid-column-gap: 12`); PIP `CS .pipf-page` @390 ได้ 4 × 78.5px gap 12px |
| 600–899px | 6 | 16px | `RULE @media (min-width: 37.5em) .pipf-page` |
| 900px ขึ้นไป | 12 | 24px | `RULE @media (min-width: 56.25em) .pipf-page`; PIP `CS` @1440 ได้ 12 × 90px gap 24px |

- หน้าสินค้า desktop: รูปฝั่งซ้าย, กล่องซื้อฝั่งขวาเริ่มคอลัมน์ 8 กว้าง 5 คอลัมน์ มี `padding-left: 2.5rem` และติดหน้าจอตอนเลื่อน (`--sticky`) (`RULE .pipf-page__right-container`; PIP `CS` @1440 กว้าง 546px)
- รายการสินค้าใช้ **container query** ไม่ใช่ media query: ตั้งชื่อ container `product-list` แล้วสลับ 2 → 3 (≥`37.5em`) → 4 (≥`64em`) → 6 (≥`112.5em`) คอลัมน์ตามความกว้างกล่อง (PLP `RULE` ใน `@container product-list`)
- PLP @1440: แถบตัวกรองซ้าย `18rem` (288px) + รายการ 1056px = 4 การ์ด × 264px ไม่มี gap ระหว่างการ์ด ใช้ padding ในการ์ดแทน (PLP `CS .plp-catalog-product-list__side-bar`, `CS .plp-product-list__products`)
- PLP @390: แสดงแบบ list (1 การ์ดต่อแถว รูปซ้าย ข้อความขวา `195px / 154px`) คั่นด้วยเส้น `1px solid #dfdfdf` (PLP `CS .plp-mastercard--list-view` @390)

### 4.4 Breakpoint

นับ `@media` ทั้งหมดใน PIP (`RULE`):
- `(min-width: 56.25em)` = 900px ใช้ 206 ครั้ง
- `(min-width: 37.5em)` = 600px ใช้ 159 ครั้ง
- `(min-width: 75em)` = 1200px ใช้ 71 ครั้ง

สามค่านี้คือ breakpoint หลัก ค่าอื่น (เช่น 700px, 1400px, 1024px) โผล่แค่ 1–13 ครั้ง ส่วนใหญ่อยู่ใน header

## 5. มุมโค้ง เส้นขอบ เงา focus

### 5.1 มุมโค้ง

นับ `border-radius` ใน PIP (`RULE`): `4px` 128 ครั้ง, `64px` 117 ครั้ง, `8px` 52 ครั้ง (+ แบบครึ่งด้าน 8px อีกหลายสิบ) ค่าอื่นมีน้อย

| ค่า | ใช้กับอะไร | หลักฐาน |
|---|---|---|
| `0` | รูปสินค้า, การ์ดสินค้า, การ์ดเนื้อหาหน้าแรก, ป้าย Top seller | PIP `VAR --product-image-radius-s/-m: 0px`; PLP `CS .plp-mastercard`; HOME `CS .pub__content-card`; PLP `CS .plp-product-badge` |
| `4px` | กล่องเลือก (choice item), checkbox, tile หมวดสินค้า, ช่องกรอก, toast | PLP `CS .plp-choice-item__border`, `.plp-checkbox__symbol`; HOME `CS .hnf-inpage-nav__card`; `RULE .crec-input-field input` |
| `8px` | ตัวเลือกสี (swatch), dialog (prompt), sheet ด้านข้าง (ฝั่งที่ลอย) | PIP `CS .pipf-product-style-picker__item`; `RULE .hnf-prompt`, `.hnf-sheets--preserve-alignment` |
| `64px` (pill) | ทุกปุ่ม, ช่องค้นหา, pill กรอง, quantity stepper, จุดสถานะ | PIP `CS .pipf-btn__inner`, `.search-box-search`, `.pipf-quantity-stepper`, `.lower-funnel-fragments-status__dot`; PLP `CS .plp-pill` |
| `50%` | วงกลมตัวกรองสี | PLP `CS .plp-color-filter__visual` |

### 5.2 เส้นขอบ

- `1px` เส้นปกติ: ขอบ stepper/checkbox สี `#929292`, เส้นแบ่งการ์ด/กล่องเลือก สี `#dfdfdf` (PIP `CS .pipf-quantity-stepper__border`; PLP `CS .plp-choice-item__border`)
- `2px` สถานะเลือกหรือ focus: swatch ที่เลือก `inset 0 0 0 2px #111`, pill ที่เลือก `border-color: #111` บนขอบ `2px`, ช่องกรอกตอน focus `2px solid #0058a3` (PIP `CS .pipf-product-style-picker__item--selected`; `RULE .plp-pill--active`; `RULE .hnf-validation-border` ตัวแปร `--skapa-validation-border-focus-border`)
- ปุ่มรองวาดขอบด้วย `box-shadow` ไม่ใช่ `border`: ปกติ `inset 0 0 0 1px`, hover/กด `inset 0 0 0 2px` (`RULE .hnf-btn--secondary`; PLP `CS .plp-btn--secondary .plp-btn__inner`)

### 5.3 เงาและชั้นความสูง

- แทบไม่ใช้เงา: เงาทิ้งตัวของ Skapa ที่เจอมีแบบเดียว `rgba(0,0,0,.1) 0 4px 16px` ใช้กับของที่ลอยบนรูป เช่นปุ่มเลื่อน carousel (PIP `RULE .pipf-overflow-carousel__button`) นับได้ 17 ครั้ง เทียบกับ `box-shadow` แบบ focus ring หลายร้อยครั้ง (ไม่นับ CSS ของ widget ภายนอกที่ใช้ตัวแปร `--tw-shadow`)
- dialog/sheet ใช้พื้น `--colour-elevation-2` (ขาว) + ฉากหลังมืด `rgba(17,17,17,.4)` แทนเงา (`RULE .hnf-sheets`, `.hnf-modal-wrapper__backdrop--dark`)
- toast ใช้ขอบ `1px` สี `--colour-elevation-1-border` (`#dfdfdf`) แทนเงา (`RULE .hnf-toast`)

### 5.4 Focus ring

แบบเดียวกันทุกที่ วัดจากการกด Tab แล้ว focus ที่ปุ่ม (`:focus-visible` = true):

- `outline: 2px solid #111111`
- `outline-offset: 4px`
- `box-shadow: 0 0 0 4px #ffffff` (ขอบขาวด้านใน กันไม่ให้วงดำติดกับปุ่มสีเข้ม)
- เปลี่ยนแบบนุ่ม `transition: outline 0.2s ease-out, box-shadow 0.2s ease-out`

หลักฐาน: PIP `CS` ปุ่ม Add to cart และปุ่ม All media ตอน focus; PLP `CS .plp-btn--icon-emphasised` ตอน focus; `RULE` พบ `outline-offset: var(--skapa-focus-outline-offset, 4px)` 286+ ครั้ง และ transition นี้ 381 ครั้ง

บนพื้นเข้ม (เช่น toast) สลับสี: วงนอกขาว วงในดำ (`RULE .hnf-toast .hnf-btn:focus-visible`)

## 6. Component

### 6.1 ปุ่ม

ขนาด (ทุกปุ่มเป็น pill `border-radius: 64px`) จาก `RULE .hnf-btn__inner`, `.hnf-btn--small`, `.hnf-btn--xsmall`:

| ขนาด | ความสูง | padding ซ้ายขวา | ตัวอักษร | พื้นที่กดจริง | ตัวอย่างที่วัดได้ |
|---|---|---|---|---|---|
| medium (ค่าเริ่ม) | `3.5rem` 56px | `2rem` 32px | 14/700 | 56px | PIP Add to cart 374.6×56 @1440, 350×56 @390 |
| small | `2.5rem` 40px | `1.5rem` 24px | 12/700 | 44px (`::after` ยื่นออก `0.125rem`) | PIP ปุ่ม All media 129×40; PIP แถบซื้อติดล่าง @390 350×40 |
| xsmall | `2rem` 32px | `1rem` 16px | 12/700 | 44px (`::after` ยื่นออก `0.375rem`) | `RULE .hnf-btn--xsmall` |
| icon-only small | 40×40 วงกลม | `0 8px` | ไอคอน 24px | 44px | PIP ปุ่มไอคอนใน header; PLP ปุ่มใส่ตะกร้า 40×40 |

แบบ (variant) จาก `RULE .hnf-btn--*`:

| Variant | พื้น ปกติ / hover / กด | ตัวอักษร | ใช้ที่ไหน |
|---|---|---|---|
| `emphasised` | `#0058a3` / `#004f93` / `#004f93` | ขาว | ปุ่มซื้อเท่านั้น (Add to cart) |
| `primary` | `#111` / `#333` / `#000` | ขาว | ปุ่มทั่วไป, ปุ่มเลื่อน carousel |
| `secondary` | โปร่ง + เส้นใน 1px `#111` (hover 2px) | `#111` | ปุ่มรอง (PLP `CS .plp-btn--secondary` ขนาด 192×40) |
| `tertiary` | โปร่ง / `#dfdfdf` / `#ccc` | `#111` | ปุ่มไอคอนใน header, ปุ่ม +/− ใน stepper |
| `plain` | โปร่งทุกสถานะ | `#111` | ลิงก์ที่ทำตัวเป็นปุ่ม |
| `danger` | `#e00751` / `#cc003d` / `#b80029` | ขาว | ลบ |
| `image-overlay` | `rgba(17,17,17,.75)` / `.85` / `.95` | ขาว | ปุ่มที่วางบนรูป (PIP ปุ่ม All media) |
| `*-inverse` | สลับสีสำหรับวางบนพื้นเข้ม | | การ์ดแคมเปญหน้าแรก (HOME `CS .pub__btn--icon-secondary-inverse`) |

ตอนกด: ตัวปุ่มย่อ `transform: scale(0.97)` (`RULE .hnf-btn:active:not(:disabled) .hnf-btn__inner`)

### 6.2 ช่องกรอก (input)

จาก `RULE .crec-input-field input` และ `RULE .hnf-validation-border*` (บนหน้าที่วัดไม่มีฟอร์มกรอกให้เห็น จึงวัดได้จาก rule เท่านั้น)

- สูง `3rem` (48px), ตัวอักษร `1rem` (16px) `line-height: 1.5`, มุม `4px`
- ขอบปกติ `1px solid #929292`, focus `2px solid #0058a3` (สีน้ำเงิน ไม่ใช่ focus ring ดำแบบปุ่ม), ผิด `#e00751`, ถูก `#0a8a00`

ช่องค้นหาใน header เป็นอีกแบบ (PIP `CS .search-box-search`, `.search-box-search__input`): pill สูง 48px พื้น `#f5f5f5` ไม่มีขอบ ข้อความ 16px ไอคอนแว่นขยายอยู่ใน `padding-left: 48px` desktop กว้าง 288.6px อยู่กลาง header, mobile กว้างเต็ม 350px เป็นแถวของตัวเอง

### 6.3 Pill (ตัวกรอง)

จาก PLP `CS .plp-pill--small` @390 และ `RULE .plp-pill*`:
- สูง 40px (small) หรือ 32px (xsmall) หรือ 56px (ค่าเริ่ม), padding `0 24px`, มุม `64px`
- พื้น `#f5f5f5` → hover `#dfdfdf` → กด `#ccc` (hover ทำงานเฉพาะใน `@media (hover: hover)`)
- ข้อความ 12/700 `#111`
- ขอบ `2px solid transparent` เสมอ พอเลือกแล้วขอบเป็น `#111` (ไม่เปลี่ยนสีพื้น) ทำให้ขนาดไม่กระโดด
- พื้นที่กดขยายด้วย `::after` (`inset: -0.1875rem` สำหรับ small, `-0.4375rem` สำหรับ xsmall) ได้ 46px
- อยู่ในแถวเลื่อนแนวนอน (`.plp-overflow-carousel__content`, padding บนล่าง 8px)

### 6.4 กล่องเลือก (choice item) และตัวเลือกสี (swatch)

- กล่องเลือกขนาด เช่น "20 - 29 cm (1)": สูง 48px ขอบ `1px #dfdfdf` มุม `4px` ข้อความหลัก 14/700 `#111` ตัวเลขจำนวน 12/400 `#484848` ห่าง 4px (PLP `CS .plp-choice-item__border`, `__title`, `__value`)
- ตัวเลือกสีบนหน้าสินค้า: กล่องรูป 65.4px @1440 / 70px @390 มุม `8px` padding `6px` อันที่เลือกมีวงใน `inset 0 0 0 2px #111` เปลี่ยนแบบ `box-shadow 0.2s ease-in-out` (PIP `CS .pipf-product-style-picker__item--selected`)
- ตัวเลือกแบบบนการ์ด PLP: รูป 40×40 (PLP `CS .plp-product-variant__img`)

### 6.5 การ์ดสินค้า

PLP @1440 (`CS .plp-mastercard`):
- กว้าง 264px, `padding: 0 20px 40px`, `gap: 12px` ระหว่างส่วน, ไม่มีพื้นหลัง ไม่มีมุมโค้ง ไม่มีเงา
- รูปสี่เหลี่ยมจัตุรัส 224×224 (`CS .plp-product__image`)
- ลำดับในการ์ด (จาก screenshot PLP @1440): ช่อง Compare → รูป (ป้ายมุมซ้ายบน, ปุ่มหัวใจลอยมุมขวาล่าง) → ข้อความโปรโมชันถ้ามี ("New", ราคาสมาชิก) → ชื่อ + คำอธิบาย (ปุ่มใส่ตะกร้าวงกลมอยู่ขวามือ) → ราคา → ดาว + จำนวนรีวิว (ขีดเส้นใต้) → สถานะของ → "More options" + ตัวเลือกแบบ
- ระหว่างแถวของการ์ดมีเส้นแบ่ง `1px #dfdfdf` (PLP `CS` เส้นล่างของ `.plp-fragment-wrapper`)
- ปุ่มหัวใจ: วงกลมขาว 40px + ขอบ `1px #dfdfdf` รวม 42px (`CS .plp-button-favourite--border`)
- ปุ่มใส่ตะกร้า: วงกลม 40px สี emphasised ไอคอน 24px (`CS .plp-btn--icon-emphasised`)

PLP @390: แบบ list `padding: 16px 14px`, เส้นแบ่ง `1px #dfdfdf` (`CS .plp-mastercard--list-view`)

รูปสินค้าใช้ `mix-blend-mode: multiply` เพื่อให้พื้นขาวของรูปกลืนกับพื้นเทา (PIP `VAR --product-image-mix-blend-mode: multiply`)

### 6.6 ป้าย (badge) และข้อความโปรโมชัน

- ป้าย "Top seller": พื้น `#e00751` ตัวอักษรขาว 12/700 `padding: 4px 6px` มุม 0 วางมุมซ้ายบนของรูป (PLP `CS .plp-product-badge`)
- ข้อความ "New" และ "IKEA Family price" ไม่มีพื้น เป็นแค่ตัวอักษรสี 14/700 (PLP `CS .plp-commercial-message--subtle--new`, `--family`) บนการ์ดหน้าแรกเป็น 12/700 (HOME `CS .pipcom-commercial-message--subtle--new`)
- ราคา BTI (พื้นเหลือง เงาแดง) เป็นตัวตนแบรนด์ IKEA **ไม่ควรลอก** (PLP `CS .plp-price--bti`)

### 6.7 ราคา (price component)

จาก `RULE .pipcom-price-module--*` และ `RULE .pipcom-price__currency`:

| ขนาด module | ตัวแปร `--_skapa-price-font-size` | ใช้ที่ |
|---|---|---|
| `xsmall` | `1.5rem` (24px) | การ์ดหน้าแรก (HOME `CS` 24px) |
| `small` | `1.75rem` (28px) | การ์ด PLP/SEARCH (PLP `CS` 28px) |
| `medium` | `2rem` (32px) | หน้าสินค้า (PIP `CS` 32px) |
| `large` | `3rem` (48px) | ยังไม่เห็นใช้บนหน้าที่วัด |
| `xlarge` | `4rem` (64px) | ยังไม่เห็นใช้บนหน้าที่วัด |

- สกุลเงิน ทศนิยม คำนำหน้า: `font-size: 0.5em` ยกขึ้นแบบตัวยก (`--currency-super-aligned`, `--decimal-super-aligned`)
- `line-height: 1` น้ำหนัก 700 สี `#111`
- ราคาแบบ subtle (ราคาเทียบ): 400 สี `#484848` (`RULE .pipcom-price--subtle`)
- ตัวเลขที่เห็นใส่ `aria-hidden="true"` แล้วมีข้อความสำหรับ screen reader แยก (`.pipcom-price__sr-text`) (PIP markup ใน `h1` ถัดไป)

### 6.8 Quantity stepper

PIP `CS .pipf-quantity-stepper*`:
- pill สูง 56px (เท่าปุ่ม Add to cart ที่อยู่ข้างกัน) ขอบ `1px #929292` padding ใน `0 8px`
- ปุ่ม − และ + เป็นปุ่มไอคอน tertiary 40×40
- ตัวเลขตรงกลาง 16/700 `#111`
- desktop กว้าง 123.4px วางข้าง Add to cart; mobile กว้างเต็ม 350px วางบน Add to cart
- มี label สำหรับ screen reader (`.pipf-quantity-stepper__sr-label`)

### 6.9 สถานะ (status) และดาวรีวิว

- จุดสถานะ: วงกลม 12px สี `#0a8a00` เว้นขวา 8px แล้วตามด้วยข้อความ 14/400 `#484848` (PIP `CS .lower-funnel-fragments-status__dot`, `__label`)
- ดาว: 5 ดวง รวม 90×24 (`--star-width: 1.125rem` = 18px) ตามด้วยจำนวนรีวิว 14px (PIP `CS .pipf-rating__stars`, `.pipf-rating__label`; PIP `VAR --star-width`) มีข้อความ sr-only แยก (`.pipf-rating__sr-only`)

### 6.10 Checkbox และ accordion (ตัวกรองด้านข้าง)

- checkbox 24×24 มุม `4px` ขอบ `1px #929292` (PLP `CS .plp-checkbox__symbol`)
- หัว accordion สูง 48px ข้อความ 14/700 (PLP `CS .plp-accordion-item-header`, `__title`)

### 6.11 Header และส่วนอื่นของหน้า

| ส่วน | desktop @1440 | mobile @390 | หลักฐาน |
|---|---|---|---|
| แถบบนสุด (ดำ) | สูง 48px | สูง 48px | PIP `CS .hnf-utilitybar` |
| header ทั้งหมด | สูง 138px (โลโก้ เมนู ค้นหา ไอคอน แถวเดียว) | สูง 180.5px (โลโก้+ไอคอน แล้วค้นหาอีกแถว) | PIP `CS .hnf-header` |
| tile หมวดสินค้าหน้าแรก | 150×173 พื้น `#f5f5f5` มุม 4px | 135×169 | HOME `CS .hnf-inpage-nav__card` |
| thumbnail รูปสินค้า | 86×86 พื้น `#efefef` อันที่เลือกขอบ `1px #111` | ซ่อน (ขนาด 0×0) | PIP `CS .pipf-product-gallery__thumbnail--active` |
| รูปหลักหน้าสินค้า | 656×656 | 390×390 เต็มจอไม่มีขอบ | PIP `CS .pipf-product-gallery__media` |
| carousel หน้าแรก | gap 20px | gap 12px และล้นออกขอบขวา | HOME `CS .pub__carousel__content` |
| footer | พื้น `#f5f5f5` `padding-top: 64px` ห่างจากเนื้อหา 64px | ห่าง 32px | PIP `CS footer` |

## 7. Motion

| อะไร | ระยะเวลา | easing | หลักฐาน |
|---|---|---|---|
| focus ring เข้า | `0.2s` | `ease-out` | `RULE` 381 ครั้ง |
| ปุ่ม (ความโปร่ง, ย่อตอนกด) | `0.25s` | `cubic-bezier(0.4, 0, 0.4, 1)` | `RULE .hnf-btn__inner`; PIP `CS .pipf-btn__inner` |
| ไอคอน (หมุน, เปลี่ยนสี) | `0.25s` | `cubic-bezier(0.4, 0, 0.4, 1)` | `RULE .hnf-svg-icon` |
| ช่องค้นหา (พื้น, ขอบ) | `0.2s` | `cubic-bezier(0.4, 0, 0.4, 1)` | PIP `CS .search-box-search` |
| swatch ตอนเลือก | `0.2s` | `ease-in-out` | PIP `CS .pipf-product-style-picker__item` |
| dialog/sheet เปิด (เลื่อนเข้า) | `0.2s` | `cubic-bezier(0, 0, 0.1, 1)` (ช้าลงตอนจบ) | `RULE` animation `*-modalSlideFromLeft` |
| dialog/sheet ปิด (เลื่อนออก) | `0.1s` | `cubic-bezier(0.9, 0, 1, 1)` (เร่งตอนออก) | `RULE` animation `*-modalSlideToRight` |
| ฉากหลัง dialog | `0.2s` | `ease` | `RULE .hnf-modal-wrapper--open > .hnf-modal-wrapper__backdrop` |
| ไอคอนโหลด | `1.5s` วนไม่หยุด | `linear` | `RULE .hnf-svg-icon--rotate` |

- easing หลักคือ `cubic-bezier(0.4, 0, 0.4, 1)` (พบ 76 ครั้งแบบแยก property และอีกหลายสิบครั้งใน shorthand) (PIP `RULE`)
- ระยะเวลาทั้งหมดอยู่ระหว่าง 0.1s–0.25s ยกเว้นไอคอนโหลด
- ถ้าผู้ใช้ตั้งลดการเคลื่อนไหว: มี rule `prefers-reduced-motion` 70 ชุด และตัวแปร `--skapa-reduced-motion-override: 1ms` ทำให้ animation แทบเป็นศูนย์ (PIP `RULE`, `VAR`)
- สิ่งที่ขยับ: focus ring, สีปุ่ม, การย่อปุ่ม, การหมุนไอคอน, dialog เลื่อนเข้าออก, ปุ่ม skip link ขยายจาก `scale(0)` เป็น `scale(1)` ตอน focus (`RULE .hnf-btn.hnf-skiplink`)

## 8. Icon

- ขนาด `1.5rem` (24px) เสมอ ทั้งใน header ปุ่ม และการ์ด (`RULE .hnf-svg-icon`, `.plp-svg-icon`; PIP `CS` svg ในปุ่ม header 24×24; PLP `CS` svg ในปุ่มใส่ตะกร้า 24×24)
- `viewBox="0 0 24 24"`, สีตามตัวอักษร `fill: currentColor`, วาดด้วย path แบบเติมสี (`fill-rule="evenodd"` 46 ครั้งบน PIP) ไม่ใช้ `stroke`
- ทุก icon ใส่ `aria-hidden="true"` และ `focusable="false"` (PIP markup)
- หมุนด้วย class สำเร็จรูปทีละ 45° (`--rotate-45`, `-135`, `-180`) แทนการทำ icon หลายตัว (`RULE .hnf-svg-icon--rotate-*`)

## 9. Accessibility

### 9.1 Contrast (คำนวณจากสีที่วัดได้ ตามสูตร WCAG)

| คู่สี | อัตราส่วน |
|---|---|
| `#111` บนขาว | 18.88 |
| `#484848` บนขาว (เนื้อหา) | 9.15 |
| `#484848` บน `#f5f5f5` | 8.39 |
| `#767676` บนขาว | 4.54 |
| `#0a8a00` (สำเร็จ) บนขาว | 4.52 |
| `#ca5008` ("New") บนขาว | 4.50 |
| `#007cc1` (ราคาสมาชิก) บนขาว | 4.51 |
| ขาวบน `#0058a3` (ปุ่มซื้อ) | 7.18 |
| ขาวบน `#e00751` (Top seller) | 4.86 |
| `#929292` บนขาว (ขอบช่องกรอก) | 3.11 |
| `#dfdfdf` บนขาว (เส้นแบ่ง) | 1.33 |

- สีสถานะและโปรโมชันทุกตัวถูกจูนให้ผ่าน 4.5:1 พอดี (4.50–4.54)
- ขอบของสิ่งที่กดได้ (`#929292`) ผ่าน 3:1 สำหรับส่วนที่ไม่ใช่ตัวอักษร
- เส้นแบ่ง `#dfdfdf` ไม่ผ่าน 3:1 แต่ใช้แค่ตกแต่ง ไม่ได้บอกขอบเขตของปุ่ม
- จุดอ่อน: `#929292` เป็นตัวอักษร (`--colour-text-and-icon-4`) ได้แค่ 3.11:1 พบ 2 จุดบน PIP (`COUNT`) ยังไม่ได้ระบุว่าเป็นข้อความอะไร

### 9.2 ขนาดพื้นที่กด

- ปุ่มเล็กสุดที่มองเห็นคือ 32px แต่ทุกปุ่มขยายพื้นที่กดเป็นอย่างน้อย 44px ด้วย `::after` (`RULE .hnf-btn--small .hnf-btn__inner::after` `inset: -0.125rem`; `.hnf-btn--xsmall ... inset: -0.375rem`)
- pill ขยายเป็น 46px (`RULE .plp-pill--small::after`, `--xsmall::after`)
- ปุ่มหลักบนหน้าสินค้า 56px ทั้ง desktop และ mobile

### 9.3 อื่นๆ

- focus มองเห็นชัดทุกปุ่ม (ดู 5.4) และใช้ `:focus-visible` จึงไม่โชว์วงตอนใช้เมาส์
- hover ทำงานเฉพาะ `@media (hover: hover)` (24 ชุดใน PIP) จอสัมผัสไม่ติดสถานะ hover ค้าง
- รองรับ `forced-colors: active` 84 ชุด เช่น ใส่ขอบโปร่งให้ปุ่มเพื่อให้เห็นรูปทรงในโหมด high contrast ของ Windows (`RULE @media (forced-colors: active) .pipf-btn__inner`)
- รองรับ `prefers-contrast: more` 35+ ชุด (PIP `RULE`)
- มี skip link (`.hnf-skiplink`), ข้อความ sr-only สำหรับดาว ราคา stepper (ดู 6.7–6.9)
- ช่องค้นหาใช้ตัวอักษร 16px ทั้ง desktop และ mobile (PIP `CS` @1440 และ @390)

## 10. Desktop เทียบ mobile (สรุป)

| เรื่อง | @1440 | @390 | หลักฐาน |
|---|---|---|---|
| ขอบหน้า | 48px | 20px | PIP `CS .pipf-content-container` |
| กริด | 12 คอลัมน์ gap 24px | 4 คอลัมน์ gap 12px | PIP `CS .pipf-page` |
| หัวข้อหน้า (H1) | 40px | 24px | PLP, HOME `CS h1` |
| หัวข้อ section | 28px | 20px | HOME `CS .pub__typography-heading-l` |
| ตัวอักษรเนื้อหา ชื่อสินค้า ราคา | เท่ากัน (14 / 16 / 32px) | เท่ากัน | PIP `CS` @1440 และ @390 |
| รายการสินค้า | grid 4 การ์ดแนวตั้ง | list 1 การ์ดแนวนอน | PLP `CS` |
| ตัวกรอง | แถบซ้ายแบบ accordion | pill เลื่อนแนวนอน | PLP, SEARCH `CS` |
| ปุ่ม Add to cart | 56px ข้าง stepper | 56px เต็มความกว้าง + แถบติดล่างที่มีปุ่ม 40px | PIP `CS` ปุ่ม Add to cart ทั้งสองตัว |
| รูปสินค้า | 656px มี thumbnail ด้านซ้าย | เต็มจอ 390px | PIP `CS .pipf-product-gallery__media` |

## 11. กฎที่อนุมานได้ (ยืมไปใช้กับ Blanksong ได้)

1. **สีเน้นมีตัวเดียว ใช้กับปุ่มซื้อเท่านั้น** — หน้าสินค้ามีพื้นสีเน้นแค่ 1 จุด หน้าแรก 0 จุด หน้าหมวด 1 จุดต่อการ์ด (ข้อ 2.3)
2. **นอกนั้นเป็นเทาล้วน 7 ระดับ ตัวอักษรใช้เทาแค่ 2 ตัว** — `#111` สำหรับสิ่งสำคัญ `#484848` สำหรับเนื้อหา ครอบคลุมตัวอักษรเกือบทั้งหมด (ข้อ 2.2, 2.3)
3. **กดได้ = pill ส่วนเนื้อหา = เหลี่ยม** — ปุ่ม ช่องค้นหา pill stepper ใช้ `64px` แต่รูปและการ์ดใช้ `0` กล่องเลือกใช้ `4px` (ข้อ 5.1)
4. **ปุ่มมี 3 ความสูง (56 / 40 / 32) พื้นที่กดไม่ต่ำกว่า 44px เสมอ** (ข้อ 6.1, 9.2)
5. **ราคาคือตัวอักษรใหญ่สุดในกล่อง** — ราคาใหญ่เป็น 2 เท่าของชื่อสินค้า (32 ต่อ 16 บนหน้าสินค้า, 28 ต่อ 14 บนการ์ด) ทศนิยมและสกุลเงินครึ่งหนึ่งแบบตัวยก ขนาดราคามีชื่อ 5 ระดับ (ข้อ 3.4, 6.7)
6. **ฟอนต์เดียว น้ำหนักแค่ 400 กับ 700** และทุกขนาดเรียกผ่านชื่อบทบาท (`heading-s`, `label-m`) ไม่เรียกเป็นตัวเลขตรงๆ (ข้อ 3.1, 3.2)
7. **ขนาดเนื้อหาไม่เปลี่ยนตามจอ เปลี่ยนแค่หัวข้อใหญ่** — สลับชุดขนาดที่ 600px และ 1200px (ข้อ 3.2, 10)
8. **letter-spacing คิดจากสูตร ไม่ตั้งทีละตัว** — ใหญ่และหนาชิดขึ้น เล็กห่างออก (ข้อ 3.3)
9. **ระยะห่างฐาน 4px** สเกล 4/8/12/16/20/24/32/40/48/64 ขอบหน้า 20/32/48 กริด 4/6/12 คอลัมน์ gap 12/16/24 (ข้อ 4)
10. **ชั้นความสูงใช้สีและฉากหลัง ไม่ใช้เงา** (ข้อ 5.3)
11. **"เลือกแล้ว" = วงดำ ไม่ใช่เติมสี** — swatch และ pill ที่เลือกได้ขอบ `#111` 2px ขนาดไม่เปลี่ยน (ข้อ 5.2, 6.3, 6.4)
12. **focus ring แบบเดียวทั้งเว็บ** — ขาว 4px ใน + ดำ 2px นอก ห่าง 4px (ข้อ 5.4)
13. **motion สั้นและเรียบ** — 0.1–0.25s, easing หลักตัวเดียว, เปิดช้ากว่าปิด, ลดเหลือ 1ms เมื่อผู้ใช้ขอ (ข้อ 7)
14. **สีสถานะจูนให้ผ่าน 4.5:1 พอดี** แทนการใช้สีสดแล้วตกเกณฑ์ (ข้อ 9.1)
15. **token สีเป็นตัวแปร runtime เก็บแบบ RGB** เพื่อทำความโปร่งและสลับธีมได้ ส่วน component มีชื่อและเวอร์ชันชัดเจนให้ทุกทีมใช้ชุดเดียวกัน (ข้อ 1)

## 12. สิ่งที่ยังวัดไม่ได้

- **หน้าตะกร้า (CART)**: ยังวัดไม่ได้ เปิดด้วย headless Chrome ได้ status 200 แต่เอกสารยาวแค่ 113 ตัวอักษร ไม่มีเนื้อหา และ curl ธรรมดาได้ 0 byte ดูเหมือนเว็บไม่ส่งหน้านี้ให้ browser อัตโนมัติ ไม่ได้พยายามหลบระบบนี้ จึงไม่มีค่าของ line item ในตะกร้า สรุปยอด หรือปุ่ม checkout
- **Chrome extension**: ต่อไม่ได้ 3 ครั้ง จึงใช้ Playwright + Chrome headless แทน ยังไม่ได้เทียบกับ browser ปกติที่มีผู้ใช้จริง
- **สถานะ hover และ pressed บนหน้าจริง**: ยังวัดไม่ได้ จดจาก CSS rule อย่างเดียว ไม่ได้เอาเมาส์ไปชี้จริง
- **ช่องกรอกฟอร์ม**: ยังวัดไม่ได้บนหน้าจริง (หน้าที่วัดไม่มีฟอร์ม) ค่าในข้อ 6.2 มาจาก CSS rule
- **ธีมมืด**: มี token ใน `.theme-dark` แต่ยังไม่เห็นเปิดใช้บนหน้าที่วัด
- **จอ tablet (600–899px)**: ยังวัดไม่ได้บนหน้าจริง ค่าคอลัมน์และขอบหน้าช่วงนี้มาจาก CSS rule
- **ความเร็ว animation จริง**: จดจากค่าใน CSS ยังไม่ได้อัดวิดีโอดูว่าลื่นแค่ไหน
- **สีตัวอักษร `#929292` 2 จุดบน PIP**: ยังไม่ได้ระบุว่าเป็นข้อความอะไร
- **สิ่งที่ screen reader อ่านจริง**: ยังวัดไม่ได้ เห็นแค่ว่ามี sr-only text และ `aria-hidden` ใน markup
- **ขนาดหัวข้อการ์ดแคมเปญหน้าแรก**: วัดได้ 20px ในการ์ดกว้าง 326px @1440 แต่ 32px ในการ์ดกว้าง 350px @390 ยังไม่ได้หาว่า rule ไหนเป็นตัวกำหนด
- **ข้อมูลภายในของ IKEA** (เอกสาร Skapa, ชื่อ token ต้นฉบับใน Sass): ไม่ได้ดู เอกสารนี้อิงจากสิ่งที่เว็บส่งมาเท่านั้น
