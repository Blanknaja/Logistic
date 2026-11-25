# หน้าสินค้าของ IKEA กับการดูสินค้าแบบ 3 มิติและ AR

งานวิจัยนี้ดูว่า ikea.com จัดหน้าสินค้าอย่างไร โดยเฉพาะปุ่มดูแบบ 3 มิติและปุ่มวางสินค้าในห้องจริง (AR) แล้วเสนอวิธีทำแบบเดียวกันบนหน้าสินค้าของ Blanksong เรายืมวิธีคิด ไม่ยืมแบรนด์ ชื่อสินค้า หรือภาพของ IKEA

- ส่วน A คือสิ่งที่หน้าเว็บ IKEA ทำจริง
- ส่วน B คือวิธีทำ 3D/AR บน Blanksong ที่ตรวจกับเอกสารต้นทางแล้ว
- ข้อที่ตรวจไม่ได้เขียนว่า **ยังยืนยันไม่ได้** และรวมไว้ท้ายไฟล์

## วิธีเก็บข้อมูล

- วันที่ดู: 25 พ.ย. 2026 เว็บ IKEA สิงคโปร์ ภาษาอังกฤษ
- ส่วนเสริม Chrome ที่วางแผนไว้ต่อไม่ได้ (ลอง 3 ครั้ง ไม่มีเบราว์เซอร์ต่ออยู่) จึงใช้สองทางแทน
  1. `curl` ดึง HTML ที่เซิร์ฟเวอร์ส่งมา แล้วอ่านโครงหน้า ข้อมูล JSON-LD และข้อมูลที่ฝังไว้ให้หน้าเว็บ (hydration) รวมทั้งไฟล์ JavaScript ของ IKEA
  2. Google Chrome แบบ headless ผ่าน Playwright 1.65 โปรไฟล์ใหม่ ไม่ล็อกอิน ขนาดจอสามแบบ
     - **D** = desktop 1440x900
     - **iOS** = จำลอง iPhone 13 (ตามค่า `devices` ของ Playwright หน้าจอ 390x664) แต่ตัวเบราว์เซอร์ยังเป็น Chromium
     - **And** = จำลอง Pixel 7 (หน้าจอ 412x839) เป็น Chromium ที่ส่ง user agent ของ Android
- แบนเนอร์คุกกี้: ไม่ได้กดยอมรับหรือปฏิเสธ บางรอบซ่อนแบนเนอร์ด้วย CSS ในหน้าจอของเราเอง เพื่อให้ถ่ายภาพหน้าได้
- ไม่ได้ใส่ของลงตะกร้า ไม่ได้กรอกหรือส่งฟอร์ม
- ไฟล์ 3D (GLB) อ่านแค่ส่วนหัวของไฟล์ (ขอเฉพาะช่วงต้นไฟล์ด้วย HTTP Range) เพื่อดูส่วนขยายที่ใช้ ขนาดจริงของโมเดล และจำนวนสามเหลี่ยม ขนาดไฟล์มาจาก `Content-Length` หรือจากส่วนหัวของ GLB
- AR ของจริงเปิดใน headless ไม่ได้ เราจึงจับ "ที่อยู่ที่หน้าเว็บพยายามเปิด" จากข้อความใน console แทน
- ชื่อไฟล์ JavaScript ของ IKEA มีรหัสต่อท้าย ซึ่งจะเปลี่ยนเมื่อ IKEA ปล่อยรุ่นใหม่ ที่อ้างในไฟล์นี้คือรุ่นที่เห็นวันที่ 25 พ.ย. 2026

### หน้าที่อ้างถึง

| รหัส | URL | หน้า | มี 3D |
|---|---|---|---|
| U1 | https://www.ikea.com/sg/en/p/tingby-side-table-on-castors-grey-70349445/ | โต๊ะข้างมีล้อ (หน้าหลักของงานนี้) | มี |
| U2 | https://www.ikea.com/sg/en/p/dyvlinge-swivel-easy-chair-kelinge-orange-80581919/ | เก้าอี้หมุน | มี |
| U3 | https://www.ikea.com/sg/en/p/billy-bookcase-black-oak-effect-20477341/ | ชั้นหนังสือ | มี |
| U4 | https://www.ikea.com/sg/en/p/ektorp-2-seat-sofa-hakebo-dark-grey-s89509014/ | โซฟา (สินค้าชุด) | ไม่มี |
| U5 | https://www.ikea.com/sg/en/p/brokglim-bath-towel-beige-60612097/ | ผ้าเช็ดตัว | ไม่มี |
| U6 | https://www.ikea.com/sg/en/p/does-not-exist-99999999/ | รหัสสินค้าที่ไม่มีจริง | - |

ป้ายบอกที่มาในไฟล์นี้: **[HTML]** อ่านจาก HTML ที่เซิร์ฟเวอร์ส่ง **[D] [iOS] [And]** เห็นใน headless ตามขนาดจอ **[JS]** อ่านจากโค้ด JavaScript ของ IKEA **[NET]** ดูจากคำขอในเครือข่ายหรือ `curl -I`

---

## ส่วน A: หน้าสินค้าของ IKEA ทำอะไรบ้าง

### A1. โครงหน้าจากบนลงล่าง

desktop แบ่งส่วนบนเป็นสองคอลัมน์ ซ้ายคือแกลเลอรี ขวาคือกล่องซื้อ ใต้ลงไปเป็นคอลัมน์เดียวเต็มความกว้าง [U1 D, HTML]

| ลำดับ | desktop (U1 D) | มือถือ (U1 iOS) |
|---|---|---|
| 1 | แถบบนสุดสีดำ: ภาษา ข้อความโปรโมชัน เลือกสาขา | เหมือนกัน แต่สั้นลง |
| 2 | หัวเว็บ: โลโก้ เมนูหมวด ช่องค้นหา บัญชี ติดตามพัสดุ รายการโปรด ตะกร้า | โลโก้กับไอคอน แล้วช่องค้นหาเป็นแถวแยก ตามด้วยแถบข้อความเรื่องค่าส่ง |
| 3 | breadcrumb ถึงชื่อสินค้า | breadcrumb แบบย่อ ("..." แล้วสองชั้นสุดท้าย) |
| 4 | ซ้าย: แกลเลอรี (รูปย่อแนวตั้ง + รูปใหญ่) ขวา: กล่องซื้อ | แกลเลอรีเต็มความกว้าง ปัดซ้ายขวา มีจุดบอกลำดับรูป |
| 5 | (อยู่ในคอลัมน์ขวา) | เลือกสี → ชื่อ → ราคา → ดาวรีวิว → "How to get it" → จำนวน → ปุ่มใส่ตะกร้า |
| 6 | แท็บ Overview / Product details / Measurements | แท็บเดียวกัน เลื่อนแนวนอนได้ มีลูกศรขวา |
| 7 | Customer reviews: การ์ดรีวิวเด่น 3 ใบ คะแนนเฉลี่ย จำนวนรีวิว ปุ่ม "Show all reviews" | เหมือนกัน กล่องคะแนนอยู่บนสุด |
| 8 | สินค้าเสริมและสินค้าแนะนำ (ลำดับดู A7) | เหมือนกัน |
| 9 | ท้ายเว็บ | ท้ายเว็บ |

หมายเหตุ: บนมือถือ ส่วน "เลือกสี" อยู่เหนือชื่อสินค้า [U1 iOS ภาพหน้าจอ]

### A2. ส่วนที่ค้างบนจอ (sticky)

- desktop: หัวเว็บไม่ค้าง เลื่อนลงแล้วหายไป [U1 D]
- desktop: คอลัมน์แกลเลอรี (`position: sticky; top: 90px`) และคอลัมน์กล่องซื้อ (`sticky; top: 96px`) ค้างเฉพาะในช่วงส่วนบนของหน้า เลื่อนพ้นส่วนนั้นแล้วทั้งคู่เลื่อนออกไป [U1 D วัดค่า computed style ระหว่างเลื่อน]
- มือถือ: เมื่อเลื่อนพ้นปุ่มใส่ตะกร้าหลัก แถบล่าง `pipf-sticky-product-bar` สูง 72 จุด มีปุ่ม "Add to cart" ค้างที่ขอบล่างจอ และหายไปเมื่อถึงท้ายเว็บ [U1 iOS]
- มือถือ: ภาพหน้าจอหลังเลื่อนลงยังเห็นหัวเว็บแบบย่อ (โลโก้กับไอคอน) อยู่บนสุด แต่ค่าที่วัดได้ขัดกัน (`top: -80px` แต่กล่องอยู่ที่ y = -7) **ยังยืนยันไม่ได้** ว่าหัวเว็บซ่อนตอนเลื่อนลงแล้วโผล่ตอนเลื่อนขึ้นหรือไม่ [U1 iOS]

### A3. แกลเลอรี

**จำนวนและชนิดสื่อ** (อ่านจาก `mediaList` ใน hydration) [HTML]

| หน้า | รูป | วิดีโอ | 3D | ลำดับที่เห็นซ้ำ |
|---|---|---|---|---|
| U1 | 6 | 0 | มี | รูปสินค้าหลักก่อนเสมอ รูปบอกขนาดอยู่ท้ายสุด |
| U2 | 12 | 0 | มี | ตามด้วยรูปที่ใช้งานจริง รูปในห้อง รูปรายละเอียดวัสดุ |
| U3 | 6 | 1 (ลำดับ 3) | มี | |
| U4 | 9 | 1 (ลำดับ 2) | ไม่มี | มีรูปผ่าให้เห็นชั้นวัสดุข้างใน |
| U5 | 5 | 1 (ลำดับ 5) | ไม่มี | |

ชนิดรูปที่ IKEA ติดป้ายไว้: `MAIN_PRODUCT_IMAGE` `CONTEXT_PRODUCT_IMAGE` (ในห้อง) `FUNCTIONAL_PRODUCT_IMAGE` (กำลังใช้งาน) `QUALITY_PRODUCT_IMAGE` (ภาพใกล้) `CUT_THROUGH_PRODUCT_IMAGE` (ภาพผ่า) `MEASUREMENT_ILLUSTRATION` (รูปบอกขนาด) [HTML]

**การจัดวาง**

- desktop: รูปย่อเรียงแนวตั้งด้านซ้าย 86x86 จุด มีปุ่มเลื่อนขึ้นลง รูปใหญ่ด้านขวามีปุ่ม "Show next image" และปุ่มลอยมุมล่างขวาสองปุ่ม "All media" กับ "View in 3D" [U1 D]
- มือถือ: ไม่มีรูปย่อ ปัดรูปซ้ายขวา มีจุดบอกลำดับใต้รูป ปุ่ม "View in 3D" ลอยมุมล่างซ้าย ปุ่มรายการโปรด (หัวใจ) มุมบนขวา ปุ่ม "All media" ถูกซ่อน [U1 iOS]
- มีลิงก์ "Skip images" ให้คนใช้คีย์บอร์ดข้ามแกลเลอรี และรูปทุกรูปมี alt ที่บรรยายภาพ [HTML]

**ซูมและดูทั้งหมด** [U1 D]

- ปุ่ม "Zoom in image" บนรูปใหญ่: กดแล้วขยายรูปในกรอบเดิม ไม่เปิดหน้าต่างใหม่
- ปุ่ม "All media": เปิดหน้าต่าง (modal) ขนาดเกือบเต็มจอ มีแท็บ "All media" กับ "Measurement" รูปเรียงสองคอลัมน์ให้เลื่อนดู
- บนมือถือ กดรูปแล้วเกิดอะไร **ยังยืนยันไม่ได้** (ไม่ได้ลอง)

**ขนาดรูปและชนิดไฟล์** [HTML, NET]

- ทุกรูปเป็นไฟล์ `..._s5.jpg` ที่ขอขนาดด้วย `?f=` ซึ่งวัดได้เป็นรูปจัตุรัส: `xxs` 400, `xs` 500, `s` 600, `m` 700, `l` 750, `xl` 900, `u` 160, `xu` 80 จุด ไม่ใส่ `?f=` ได้ 1400 จุด
- รูปใหญ่ใช้ `srcset` 400w ถึง 900w กับ `sizes` ตามความกว้างจอ รูปย่อใช้ 80px หรือ 160px
- ชนิดไฟล์เลือกตาม header `Accept` ของเบราว์เซอร์: ขอ AVIF ได้ AVIF (ขนาด `s` 8,773 ไบต์) ขอ WebP ได้ WebP (8,764 ไบต์) ขอ JPEG ได้ JPEG (15,776 ไบต์) ชื่อไฟล์ยังลงท้าย `.jpg` เหมือนเดิม
- รูปใหญ่รูปแรก `loading="eager"` และ `fetchpriority="high"` รูปย่อ `eager` รูปใหญ่ที่เหลือ `lazy` เปิดหน้า desktop รอ 9 วินาที มีคำขอชนิดรูปทั้งหน้า (รวมโลโก้และไอคอน) แค่ 13 คำขอ
- ข้อมูลยังเก็บรูปต้นฉบับที่สัดส่วนต่างกันได้ (U1 มี 5:4, 3:4 และ 1:1 ด้านยาว 4000 ถึง 5000 จุด) แต่หน้าแสดงเป็นจัตุรัส

**วิดีโอ** [U3 U4 U5 D]

- เป็น `<video>` ไฟล์ mp4 ที่ขอความกว้าง `?imwidth=800` ปิดเสียง ไม่เล่นเอง ไม่มีแถบควบคุมของเบราว์เซอร์ มีรูปหน้าปก
- ข้อมูลวิดีโอมีคำบรรยายเนื้อหาวิดีโอ (`transcript`) และมีปุ่มเปิดคำบรรยาย [HTML]

### A4. ดูแบบ 3 มิติและ AR

#### ปุ่มโผล่เมื่อไร

- ปุ่ม "View in 3D" ไม่อยู่ใน HTML ที่เซิร์ฟเวอร์ส่ง หน้าเว็บโหลดสคริปต์ชื่อ rotera แล้วถาม `https://web-api.ikea.com/sg/en/rotera/data/model/<รหัสสินค้า>/` ถ้าได้ 200 ปุ่มจึงโผล่ (ประมาณ 1.8 วินาทีหลังเริ่มโหลดหน้า) ถ้าได้ 204 ก็ไม่มีปุ่ม เหลือแค่ "All media" [U1 U2 U3 ได้ 200, U4 U5 ได้ 204, D NET]
- หน้าที่ไม่มี 3D จึงไม่มีอะไรเพิ่มเลย ไม่มีปุ่มกดไม่ได้ ไม่มีข้อความบอกว่าไม่มี [U4 U5 D]

#### กดแล้วเกิดอะไร

desktop [U1 D]:

- เปิดหน้าต่างใหญ่ (`role="dialog"` `aria-modal="true"`) ซ้ายเป็นพื้นที่ 3D ขวาเป็นแถบข้อมูล
- พื้นที่ 3D: หมุนด้วยเมาส์ นิ้ว หรือปุ่มลูกศร (ข้อความช่วยบอกไว้ว่า "Use mouse, touch or arrow keys to move") มีวงจุดรอบฐานบอกว่าหมุนได้ ปุ่ม "..." มุมบนขวา และปุ่ม "Make background darker" กับ "Like and share"
- แถบขวา: ชื่อสินค้า ปุ่ม (i) ดูข้อมูล วงกลมสีให้สลับสีในหน้าต่างเดิม (ปุ่ม "Previous color" / "Next color") หัวข้อ "Preview in AR" พร้อมข้อความ "Scan this QR code to view in your home" กดแล้วกาง QR code ราคา และปุ่ม "Add to bag"
- QR code ถอดได้เป็น `https://www.ikea.com/sg/en/p/tingby-side-table-on-castors-grey-70349445/?openAr=sg-en-70349445` คือหน้าสินค้าเดิมที่ต่อท้าย `?openAr=` [U1 D ถอด QR จากรูปในหน้า]

มือถือ [U1 And]:

- เปิดเป็นแผ่นเลื่อนจากล่าง (bottom sheet) ด้านบนเป็นพื้นที่ 3D ด้านล่างเป็นชื่อ ราคา สี และปุ่ม "Add to bag"
- ในหน้าต่างมีปุ่ม "Try it in your home" (ในภาพน่าจะเป็นไอคอนลูกบาศก์มุมล่างขวาของพื้นที่ 3D) ปุ่มพระจันทร์ (ทำพื้นหลังมืด) ปุ่ม "..." และปุ่มปิด ปุ่ม "Try it in your home" ไม่มีบน desktop
- กด "Try it in your home" บน Android แล้วหน้าเว็บพยายามเปิดที่อยู่นี้ (จับจาก console เพราะ headless ไม่มีแอปรับ):

```
intent://arvr.google.com/scene-viewer/1.0?mode=ar_preferred&resizable=false
  &enable_vertical_placement=false&disable_occlusion=true
  &file=https://web-api.ikea.com/sg/en/rotera/static/models/70349445-mini.glb
  #Intent;scheme=https;package=com.google.ar.core;action=android.intent.action.VIEW;
  S.browser_fallback_url=<หน้าสินค้าเดิม>;end;
```

  แปลว่า IKEA ส่งไฟล์ให้แอป Google Scene Viewer ผ่าน Google Play Services for AR (`com.google.ar.core`) ห้ามย่อขยายโมเดล (`resizable=false` คือขนาดจริงเสมอ) และถ้าเปิดไม่ได้ให้กลับมาหน้าสินค้า
- จำลอง iPhone ใน Chromium แล้ว **ไม่มี** ปุ่ม "Try it in your home" เพราะโค้ดของ IKEA เช็กว่าเบราว์เซอร์รองรับ `<a rel="ar">` ซึ่งมีแค่ Safari บน iOS [U1 iOS, JS] ส่วนบน iPhone จริง **ยังยืนยันไม่ได้**
- เปิดลิงก์ `?openAr=` บน Android: หน้าเว็บพยายามเปิด Scene Viewer ทันทีโดยไม่ต้องกด บน desktop: เปิดหน้าต่าง 3D ให้เลย [U1 And, D]

#### ใช้เทคโนโลยีอะไร

- หน้าต่าง 3D ที่เห็น **ไม่ใช่** `<model-viewer>` ในหน้าไม่มีแท็กนี้ ไม่มี iframe มีแต่ `<canvas data-engine="three.js r183" data-camera-controls-version="3.1.2">` คือ IKEA วาดเองด้วย three.js กับไลบรารี camera-controls [U1 D อ่าน DOM]
- ในชุดโค้ด rotera มี Google `<model-viewer>` รวมอยู่ (lit 4.2.2 และตั้งค่า `ar-modes="scene-viewer quick-look"` `ar-scale="fixed"` `shadow-intensity="0.6"` `interaction-prompt="auto"`) ใช้ในทางแสดง 3D แบบฝังในหน้า แต่ตอนกด "View in 3D" บน desktop ทางนั้นไม่ถูกเรียก ไฟล์ model-viewer ตัวใหญ่ (`model-viewer-rF8pQRm9.js`) ไม่ถูกโหลด [JS `model-viewer-Bsn1-eVI.js`, D NET]
- วิธีเลือกโหมด AR ของหน้าต่าง 3D (อ่านจาก `multi-model-viewer-Bej5HPvB.js`) [JS]
  - เป็น iOS และ `relList.supports("ar")` เป็นจริง → AR Quick Look โดย **แปลง GLB เป็น USDZ ในเบราว์เซอร์** ด้วย USDZExporter ของ three.js แล้วเปิดลิงก์ `rel="ar"` ที่ต่อท้าย `#allowsContentScaling=0` (ห้ามย่อขยาย)
  - เป็น Android ที่ไม่ใช่ Firefox หรือ Oculus → Scene Viewer ตาม intent ข้างบน
  - นอกนั้น → ไม่มีโหมด AR ปุ่มไม่โผล่ desktop เห็น QR code แทน
  - มีฟังก์ชันเช็ก WebXR อยู่ แต่ไม่ถูกใช้ในการเลือกโหมด จึง **ไม่ใช้ WebXR**

#### ไฟล์โมเดล

ไฟล์ที่หน้าต่าง 3D โหลดจริงคือ `https://web-api.ikea.com/sg/en/rotera/static/models/<รหัส>-mini.glb` [NET]

| สินค้า | ขนาดไฟล์ | สามเหลี่ยม | ขนาดโมเดล (เมตร) | ส่วนขยายที่บังคับ |
|---|---|---|---|---|
| U1 โต๊ะ 50x50x45 ซม. | 151,224 ไบต์ | 4,826 | 0.51 x 0.45 x 0.51 | Draco, WebP |
| U2 เก้าอี้ | 130,840 ไบต์ | 35,932 | 0.63 x 0.68 x 0.75 | Draco, WebP |
| U3 ชั้นหนังสือ 80x28x202 ซม. | 112,812 ไบต์ | 6,746 | 0.80 x 2.05 x 0.28 | Draco, WebP |

- โมเดลทำในขนาดจริงหน่วยเมตร ตรงกับขนาดสินค้า จึงวางในห้องแบบขนาดจริงได้
- ใช้ `KHR_draco_mesh_compression` (บีบรูปทรง) กับ `EXT_texture_webp` (พื้นผิวเป็น WebP) ทำให้ไฟล์เล็ก ตัวถอด Draco โหลดจาก `https://www.gstatic.com/draco/versioned/decoders/1.5.7/` (wasm 88,859 ไบต์ตอนบีบอัดส่ง) [NET]
- ไฟล์ mini ตอบ `Access-Control-Allow-Origin: *` [NET]
- หน้า HTML ยังใส่ JSON-LD ชนิด `3DModel` บอกไฟล์ GLB อีกชุด (U1 7 ไฟล์, U2 1 ไฟล์, U3 19 ไฟล์ แยกระดับคุณภาพ) ขนาดตั้งแต่ 149,824 ไบต์ ถึง 4,800,152 ไบต์ ไฟล์ชุดนี้ส่ง `Cache-Control: public,max-age=3600` แต่หน้าต่าง 3D ไม่ได้ใช้ชุดนี้ [HTML, NET]
- ไฟล์ของ U1 ในชุด JSON-LD บอกว่าทำด้วย Simplygon กับ glTF-Transform พื้นผิว 2048 จุด [ส่วนหัว GLB]

#### ราคาที่ต้องจ่าย (น้ำหนักที่โหลดเมื่อกด)

กด "View in 3D" บน desktop แล้วโหลดเพิ่ม (ขนาดตอนบีบอัด brotli) [NET]: แกน three.js 212,293 ไบต์ ตัวแสดงหลายโมเดล 102,836 ไบต์ หน้าต่างและแถบข้าง 24,954 ไบต์ กับไฟล์เล็กอีกหลายไฟล์ ตัวถอด Draco และไฟล์โมเดล 151,224 ไบต์ จากกดถึงได้ไฟล์โมเดลราว 1.5 วินาที (วัดครั้งเดียวใน headless ไม่ใช่การวัดความเร็วจริงจัง) ก่อนกดโหลดแค่สคริปต์ตัวเริ่ม 10,035 ไบต์กับตัวเตรียมหน้าต่าง 16,393 ไบต์

### A5. กล่องซื้อ [U1 D, iOS]

- ชื่อสินค้าตัวหนา ("TINGBY") บรรทัดถัดไปเป็นชนิด สี และขนาด ("Side table on castors, grey, 50x50 cm") ขนาดเป็นลิงก์ขีดเส้นใต้ (กดแล้วไปไหน **ยังยืนยันไม่ได้**) มุมขวาบนเป็นปุ่มหัวใจ
- ราคา: เลขหลักใหญ่ ทศนิยมตัวเล็กยกขึ้น ("$69.90") มีข้อความสำหรับโปรแกรมอ่านจอว่า "Price $ 69.90" รูปแบบเลขมาจาก config `priceFormat` ว่าใส่ `$` นำหน้า [HTML]
- ดาว 5 ดวงกับ "(42)" เป็นปุ่ม กดแล้วเปิดหน้าต่างรีวิว [D]
- "Choose colour" แสดงชื่อสีที่เลือก และรูปย่อของทุกสี แต่ละสีคือ **หน้าสินค้าแยกกันคนละ URL** [HTML `productStylePickerProps`] ถ้ามีหลายมิติ เช่นผ้าเช็ดตัวมี "Choose size" และบอกส่วนต่างราคาของแต่ละขนาด เช่น "−$16" [U5 HTML]
- "How to get it": จุดเขียวกับ "In stock in IKEA Alexandra" เวลาเปิดสาขา ลิงก์ "Find in store" และ "Delivery to your home*" ตอนแรก HTML ส่งข้อความ "Checking availability..." แล้วสคริปต์มาเติมทีหลัง [HTML, D]
- ปุ่มลดเพิ่มจำนวน (− 1 +) กับปุ่ม "Add to cart" สีน้ำเงินกว้าง
- บางหน้ามีกล่องเพิ่ม: "Design it yourself" (U3) "Customise and view options" กับข้อความผ่อน 0% (U4) "Buy more, save more in-store!" (U5) [HTML]

### A6. ข้อมูลสินค้า [U1 D, HTML]

- แท็บ Overview / Product details / Measurements (U4 มีแท็บ "What's included" เพิ่ม) กดแล้ว **สลับเนื้อหา** แสดงทีละแท็บ ไม่ได้เลื่อนไปที่หัวข้อ [D ตรวจว่า tabpanel ไหนแสดง]
- Overview: ชื่อกับรหัสสินค้าในป้ายดำ ("703.494.45") ย่อหน้าบรรยายสั้น หัวข้อ "More information" แบบพับได้ (accordion) "Materials and care" กับ "Assembly and documents" และรูปในห้องหนึ่งรูปด้านขวา
- Product details: ข้อดีเป็นข้อๆ แล้ว accordion "Good to know" "Materials and care" "Safety and compliance" (บางหน้า) "Assembly and documents"
- Measurements: รูปบอกขนาด accordion "Measurements" **กางไว้แล้ว** (ยาว กว้าง สูง น้ำหนักรับได้) และ "Packaging" พับไว้ (ขนาดกล่องและน้ำหนัก)
- รีวิว: การ์ดรีวิวเด่น 3 ใบเลื่อนได้ คะแนนเฉลี่ยกับจำนวนรีวิว และปุ่ม "Show all reviews" เปิดหน้าต่างที่มีแท่งนับดาว 5 ถึง 1 คะแนนแยกด้าน (Appearance, Ease of assembly/installation, Product quality, Value for money, Works as expected) ตัวกรอง การเรียง และแท็บ "Singapore" กับ "Other countries" [D]
- HTML ยังมีรายการรีวิวเต็มข้อความอีกชุด (`pipf-seo-reviews`) และ JSON-LD `Product` ที่มี `aggregateRating` กับ `review` [HTML]

### A7. ส่วนแนะนำสินค้าอื่น ตามลำดับ [U1 HTML, D]

1. "Accessories for TINGBY" ตารางรูป ช่องแรกใหญ่ มีปุ่ม "Show all accessories"
2. "Looks by you" รูปจากลูกค้า (มีหัวข้อใน HTML แต่ใน headless ไม่เห็นเนื้อหา **ยังยืนยันไม่ได้** ว่าว่างหรือโหลดไม่ขึ้น)
3. "Related products" ตามด้วย "Explore more options" ทางลัดหมวดหมู่พร้อมจำนวนสินค้า (Side tables 85, Coffee tables 58, Nesting tables 11) รายการสินค้าในหัวข้อนี้ไม่เห็นใน headless **ยังยืนยันไม่ได้**
4. "Recommended for you" การ์ดสินค้าเลื่อนแนวนอน: รูป หัวใจ ปุ่มใส่ตะกร้าแบบไอคอน ชื่อ ราคา ดาว "Available for delivery" และ "More options" เป็นรูปย่อของแบบอื่น
5. "More from the ..." (สินค้าชุดเดียวกัน)
6. "Get the look" ไอเดียจากสินค้าที่เคยดู

### A8. สถานะกำลังโหลด ว่าง และผิดพลาด

- กำลังโหลด: "Checking availability..." ในกล่องส่งของ [HTML] ส่วนสินค้าเสริมมีโครงรอ (`skeletonCount`) [HTML] ข้อความ "Loading reviews" และหน้าต่าง 3D มี "Loading..." [HTML ข้อความแปล] ปุ่ม 3D ไม่โผล่จนกว่าจะรู้ว่ามีโมเดล [D]
- ว่าง: ไม่มีรูปใช้ข้อความ "Image coming soon" ไม่มีโมเดลก็ไม่มีปุ่ม [HTML ข้อความแปล, U4 U5 D]
- ซื้อไม่ได้: ปุ่มใส่ตะกร้าเปลี่ยนข้อความเป็น "Sold out" "Sold out online" "Currently not sold online" "Only sold in-store" "Discontinued" และมีหัวข้อ "Explore products similar to ..." [HTML ข้อความแปล ไม่ได้เห็นหน้าจริงที่หมด]
- รหัสสินค้าไม่มีจริง (U6): ตอบ 301 พาไปหน้า "Products" (`/sg/en/cat/products-products/`) ไม่มีหน้า 404 [NET]
- ชื่อใน URL ผิดแต่รหัสถูก (`/sg/en/p/anything-70349445/`): พาไป URL ที่ถูกของสินค้านั้น [NET]

### A9. สิ่งที่ Blanksong ควรยืม

- ปุ่ม 3D โผล่เฉพาะสินค้าที่มีโมเดล สินค้าอื่นไม่มีอะไรเพิ่ม
- โหลดตัวแสดง 3D และไฟล์โมเดล **เมื่อกดเท่านั้น** หน้าปกติไม่หนักขึ้น
- โมเดลขนาดจริงหน่วยเมตร และเปิด AR แบบห้ามย่อขยาย ผู้ซื้อจึงเห็นว่าของวางในห้องได้จริงไหม
- ปุ่ม AR โผล่เฉพาะเครื่องที่เปิดได้ desktop ไม่หลอกให้กด
- iOS ไม่ต้องมีไฟล์ USDZ แยก แปลงจาก GLB ในเบราว์เซอร์ได้

---

## ส่วน B: ทำ 3D/AR บน Blanksong

### B1. Google `<model-viewer>` ตอนนี้เป็นอย่างไร

| เรื่อง | ค่า | ที่มา |
|---|---|---|
| รุ่นล่าสุด | 4.4.0 (ออก 9 ต.ค. 2026) | https://registry.npmjs.org/@google%2fmodel-viewer (`dist-tags.latest`) |
| สัญญาอนุญาต | Apache-2.0 | registry และ `package.json` ของรุ่น 4.4.0 |
| ต้องลงคู่กัน | `three` รุ่น `^0.183.0` (peer dependency) ตัวมันเองใช้ `lit` กับ `@monogrid/gainmap-js` | registry, README "Installing" |
| ขนาด | `dist/model-viewer.min.js` (รวม three) 1,069,272 ไบต์ บีบ gzip ได้ราว 289 KB, `model-viewer-module.min.js` (ไม่รวม three) 475,465 ไบต์ gzip ราว 144 KB | https://data.jsdelivr.com/v1/packages/npm/@google/model-viewer@4.4.0 และวัด gzip เอง |
| เบราว์เซอร์ | 2 รุ่นหลักล่าสุดของ Chrome Firefox Safari Edge ทั้ง desktop และมือถือ | https://github.com/google/model-viewer (README ของ `packages/model-viewer`) |
| ไฟล์ที่ `src` รับ | glTF/GLB เท่านั้น | https://modelviewer.dev/docs/index.html (หมวด Loading ข้อมูลจาก `modelviewer.dev/data/docs.json`) |
| โหมด AR | `ar-modes` ค่าเริ่มต้น `"webxr scene-viewer quick-look"` เรียงตามลำดับที่ลองก่อน | docs หมวด Augmented Reality |
| iOS | ไม่ใส่ `ios-src` แล้วสร้าง USDZ ให้ตอนกดปุ่ม AR (แอนิเมชันยังไม่รองรับ) | docs หัวข้อ `ar-modes` และ `ios-src` |
| ขนาดใน AR | `ar-scale="fixed"` ล็อกที่ 100% ค่าเริ่มต้น `auto` ให้หยิกย่อขยาย | docs หัวข้อ `ar-scale` |
| ปุ่ม AR | โผล่เมื่ออาจเปิด AR ได้ เปลี่ยนเป็นปุ่มของเราได้ด้วย `slot="ar-button"` และเช็กได้ที่ `canActivateAR` | docs หัวข้อ `ar-button` และ `canActivateAR` |
| Draco/KTX2 | ตัวถอดโหลดจาก CDN ของ Google เป็นค่าเริ่มต้น เปลี่ยนที่อยู่ได้ด้วย `dracoDecoderLocation` | docs หมวด Loading |
| ผิดพลาด | event `error` มี `detail.type` เป็น `loadfailure` หรือ `webglcontextlost` ตัวมันไม่ลองโหลดใหม่เอง | docs หมวด Loading |

โหมด AR ทั้งสามแบบ (FAQ ที่ https://modelviewer.dev/docs/faq.html):

- **webxr**: AR อยู่ในเบราว์เซอร์ Android เลย ไม่ต้องโหลดไฟล์ใหม่ เป็นโหมดแรกบน Android ต้องเป็น secure context (HTTPS หรือ localhost) ตาม https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API
- **scene-viewer**: เปิดแอป Google แยก แอปนั้นโหลดไฟล์จาก URL ใหม่เอง ต้องเป็นเครื่องที่รองรับ ARCore, Android 7.0 ขึ้นไป มี Google Play Services for AR และแอป Google รุ่นใหม่ ถ้าไม่มี ARCore โหมด `ar_preferred` จะตกไปดูแบบ 3D ในแอปแทน (https://developers.google.com/ar/develop/scene-viewer)
- **quick-look**: AR Quick Look ของ iOS ใช้ไฟล์ USDZ ผ่านลิงก์ `<a rel="ar">` ที่มี `<img>` อยู่ข้างในหนึ่งตัว เช็กได้ด้วย `a.relList.supports("ar")` (https://webkit.org/blog/8421/viewing-augmented-reality-assets-in-safari-for-ios/)

ข้อกำหนดไฟล์ของ Scene Viewer (https://developers.google.com/ar/develop/scene-viewer หัวข้อ "File requirements for models"):

- glTF 2.0 / GLB โหลดไฟล์ผ่าน HTTPS
- แนะนำไม่เกิน 100,000 สามเหลี่ยม (30,000 ถึง 50,000 ดีที่สุด) ไม่เกิน 10 วัสดุ พื้นผิวไม่เกิน 2048 x 2048
- ขนาดไฟล์แนะนำ 10 MB ตัวตรวจของ Scene Viewer เตือนเมื่อเกิน 10 MB และถือว่าผิดเมื่อเกิน 15 MB
- ส่วนขยายที่เอกสารระบุว่ารองรับมีแค่ `KHR_materials_unlit` กับ `KHR_texture_transform` แต่ IKEA ส่งไฟล์ที่บังคับ Draco กับ WebP ให้ Scene Viewer จริง (A4) จึงน่าจะเปิดได้ แต่ **ยังยืนยันไม่ได้** ว่าเปิดได้ทุกเครื่อง

### B2. โหลดใน Next.js 16 App Router กับ React 19

- ห้าม import แบบปกติในไฟล์ component เพราะ client component ยังถูกเรนเดอร์บนเซิร์ฟเวอร์ก่อน และโค้ดของ model-viewer อ่าน `self.XRSession` ตั้งแต่ตอนโหลดโมดูล [อ่านจาก `dist/model-viewer-module.min.js` 4.4.0] ขณะที่ Node 26 ไม่มี `self` `customElements` และ `HTMLElement` (ลองด้วย `node -e` ในเครื่อง) import บนเซิร์ฟเวอร์จึงพัง
- คู่มือ Next.js ในโปรเจกต์ (`node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md` ตรงกับ https://nextjs.org/docs/app/guides/lazy-loading) ให้ใช้ `import()` โหลดไลบรารีภายนอกเมื่อต้องใช้ใน client component และบอกว่า `next/dynamic` แบบ `ssr: false` ใช้ได้เฉพาะใน client component
- React 19 รองรับ custom element เต็มที่: ฝั่ง client ตั้งเป็น property ฝั่งเซิร์ฟเวอร์ค่า string number และ `true` ออกเป็น attribute ส่วน `false` object function ไม่ออก (https://react.dev/blog/2024/12/05/react-19 หัวข้อ "Support for Custom Elements")
- แพ็กเกจประกาศชนิดแค่ `HTMLElementTagNameMap['model-viewer']` ไม่ได้ประกาศให้ JSX (`dist/model-viewer.d.ts`) ต้องประกาศ `IntrinsicElements` เอง และ `@types/react` 19.3 ในโปรเจกต์วาง `namespace JSX` ไว้ใต้ `React` [อ่านจาก `node_modules/@types/react/index.d.ts`]

รูปแบบที่ใช้ได้ (รูปแบบชนิดข้อมูลให้ยืนยันด้วย `pnpm typecheck` ตอนลงมือ ยังไม่ได้คอมไพล์จริง):

```tsx
"use client";

import { useEffect } from "react";

export function ProductModel({ src, poster, alt }: { src: string; poster: string; alt: string }) {
  useEffect(() => {
    void import("@google/model-viewer");
  }, []);
  return (
    <model-viewer src={src} poster={poster} alt={alt} ar ar-scale="fixed" camera-controls touch-action="pan-y">
      <button slot="ar-button" type="button">ดูในห้องของคุณ</button>
    </model-viewer>
  );
}
```

```ts
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.HTMLAttributes<HTMLElement> & { src: string; alt: string; poster?: string; ar?: boolean };
    }
  }
}
```

ชื่อ attribute ที่มีขีดกลาง เช่น `ar-scale` TypeScript ไม่ตรวจอยู่แล้ว จึงไม่ต้องประกาศ

### B3. ทดลองจริงในเครื่อง

สร้างหน้า HTML หน้าเดียวโหลด model-viewer 4.4.0 จาก jsDelivr กับโมเดล SheenChair (B5) แล้วเปิดด้วย Chrome headless ที่ `http://127.0.0.1` ใส่ `ar ar-modes="webxr scene-viewer quick-look" ar-scale="fixed" camera-controls`

| เครื่องที่จำลอง | โหลดโมเดล | `canActivateAR` | ปุ่ม AR | ขนาดที่อ่านได้ (ม.) |
|---|---|---|---|---|
| desktop | ได้ | false | ซ่อน | 0.83 x 0.69 x 0.57 |
| Pixel 7 (Android) | ได้ | true | แสดง | 0.83 x 0.69 x 0.57 |
| iPhone 13 (แต่เป็น Chromium) | ได้ | false | ซ่อน | 0.83 x 0.69 x 0.57 |

- กดเปิด AR บน Android จำลอง model-viewer พยายามเปิด `intent://arvr.google.com/scene-viewer/1.2?mode=ar_preferred&disable_occlusion=true&resizable=false&file=<URL ของ GLB>#Intent;scheme=https;package=com.google.android.googlequicksearchbox;...;S.browser_fallback_url=<หน้าเดิม>#model-viewer-no-ar-fallback;end;` ต่างจาก IKEA ตรงที่ไปทางแอป Google (เปิดดู 3D ได้แม้ไม่มี ARCore) ไม่ใช่ `com.google.ar.core`
- Chrome headless มี `navigator.xr` แต่ model-viewer ยังข้าม webxr ไปใช้ scene-viewer ตามลำดับ แปลว่าการเช็กว่าเปิด AR ใน WebXR ได้ไม่ผ่าน ซึ่งคาดไว้แล้วเพราะเครื่องจำลองไม่มีกล้องและ ARCore
- เปิดที่ `127.0.0.1` ได้ `isSecureContext = true` ตรงกับ MDN ที่บอกว่า localhost และ 127.0.0.0/8 นับเป็น secure (https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts)
- สิ่งที่ยืนยันได้: บนแล็ปท็อปดู 3D ได้จริง และปุ่ม AR ซ่อนเองบน desktop โดยไม่ต้องเขียนโค้ดเช็กเครื่อง

### B4. กฎไฟล์ที่ผู้ขายส่งขึ้นมา

- **ชนิด: GLB อย่างเดียว** ไม่รับ `.gltf` (ไฟล์แยกหลายชิ้น) และไม่รับ USDZ (model-viewer สร้างให้ iOS เอง B1)
- **ตรวจจากไบต์ ไม่เชื่อนามสกุล** แบบเดียวกับ `detectImageType` ใน `src/shared/rules.ts` ส่วนหัว GLB 12 ไบต์คือ `glTF` แล้วตามด้วยเลขรุ่น 2 และความยาวไฟล์ (เลข 32 บิตแบบ little-endian) ให้รับเมื่อ 4 ไบต์แรกเป็น `67 6C 54 46` รุ่นเป็น 2 และความยาวในหัวเท่ากับขนาดไฟล์จริง (เทียบแล้วตรงทุกไฟล์: ไฟล์ IKEA 3 ไฟล์ที่รู้ `Content-Length` และไฟล์ Khronos 7 ไฟล์ใน B5)
- **ขนาดสูงสุด 10 MB** ตามที่ Scene Viewer แนะนำ (B1) เทียบกับ IKEA ไฟล์ที่ตัวแสดงโหลดจริงอยู่ที่ 110 ถึง 150 KB ไฟล์ใหญ่สุดในชุด JSON-LD 4.8 MB (A4) ข้อความแนะนำผู้ขายควรบอกให้ทำไฟล์เล็กที่สุดเท่าที่ทำได้
- **บอกผู้ขายว่าโมเดลต้องเป็นขนาดจริงหน่วยเมตร** เพราะเราจะใช้ `ar-scale="fixed"` แบบ IKEA ระบบตรวจขนาดจริงไม่ได้
- ข้อจำกัดที่รับไว้ก่อน: ไฟล์ที่ใช้ Draco หรือ KTX2 จะให้เบราว์เซอร์โหลดตัวถอดจาก CDN ของ Google (B1) เครื่องที่ไม่มีอินเทอร์เน็ตจะเปิดไฟล์แบบนั้นไม่ได้

### B5. ไฟล์ตัวอย่างที่ใช้สัญญาอนุญาตเปิดสำหรับข้อมูลตัวอย่าง

มาจาก Khronos glTF-Sample-Assets (https://github.com/KhronosGroup/glTF-Sample-Assets) สัญญาอนุญาตอ่านจาก `Models/<ชื่อ>/metadata.json` ของแต่ละโมเดล ขนาดจาก `Content-Length` ของ `Models/<ชื่อ>/glTF-Binary/<ชื่อ>.glb` ขนาดโมเดลจากส่วนหัว GLB

| โมเดล | สัญญาอนุญาต | ไฟล์ | ขนาด (ม.) | ส่วนขยายที่บังคับ | เข้ากับหมวดตัวอย่างของเรา |
|---|---|---|---|---|---|
| SheenChair | CC0-1.0 (Eric Chadwick / Wayfair) | 4.1 MB | 0.83 x 0.69 x 0.57 | `KHR_texture_transform` | ของแต่งบ้าน (ยังไม่มีคำว่าเก้าอี้ในรายการคำ) |
| GlassVaseFlowers | CC0-1.0 (Eric Chadwick, Rico Cilliers) | 1.8 MB | 0.10 x 0.20 x 0.22 | ไม่มี | "ต้นไม้ในกระถาง" หมวด 12 |
| DiffuseTransmissionTeacup | CC0-1.0 (Polyhaven.com, Eric Chadwick) | 4.8 MB | 0.15 x 0.07 x 0.15 | ไม่มี | "แก้วน้ำ" หมวด 6 |
| WaterBottle | CC0-1.0 (Microsoft) | 9.0 MB | 0.11 x 0.26 x 0.11 | ไม่มี | "ขวดน้ำกีฬา" หมวด 9 |
| GlamVelvetSofa | CC-BY-4.0 (Eric Chadwick / Wayfair) ต้องใส่เครดิต | 3.1 MB | 2.19 x 0.79 x 1.02 | `KHR_texture_transform` | โซฟา ถ้าจะเพิ่มคำ |
| ChairDamaskPurplegold | CC-BY-4.0 (Eric Chadwick / Wayfair) ต้องใส่เครดิต | 2.0 MB | 0.83 x 0.69 x 0.57 | ไม่มี | เก้าอี้ ถ้าจะเพิ่มคำ |
| GlassHurricaneCandleHolder | CC-BY-4.0 (Eric Chadwick / Wayfair) ต้องใส่เครดิต | 2.7 MB | 0.19 x 0.37 x 0.38 | ไม่มี | "เทียนหอม" หมวด 12 |

- คำในคอลัมน์สุดท้ายอ้างรายการคำของ `src/shared/seed/catalog.ts`
- ไม่แนะนำ BoomBox (CC0 แต่โมเดลกว้างแค่ราว 2 ซม.) Lantern ToyCar AntiqueCamera (ขนาดไม่ใช่หน่วยเมตร) เพราะ AR แบบขนาดจริงจะดูผิด และ MaterialsVariantsShoe (CC-BY ของ Shopify ขนาด 2.0 หน่วย ไม่น่าใช่เมตร)
- โมเดลหลายตัวใช้วัสดุพิเศษ เช่น sheen หรือ transmission ซึ่ง model-viewer วาดได้ แต่ Scene Viewer ไม่ได้ระบุว่ารองรับ (B1) ภาพใน Scene Viewer อาจต่างจากในเว็บ **ยังยืนยันไม่ได้**
- แนะนำใช้แค่ไฟล์ CC0 จะได้ไม่ต้องดูแลเครดิต ถ้าใช้ CC-BY ต้องเขียนเครดิตไว้ใน repo

### B6. สิ่งที่ลองบนแล็ปท็อปไม่ได้ และวิธีลอง

ลองบนแล็ปท็อปได้: หน้าแสดง 3D หมุน ซูม ภาพปก การซ่อนปุ่ม AR บน desktop การส่งไฟล์และการตรวจไฟล์ (B3)

ลองบนแล็ปท็อปไม่ได้: การวางของในห้องจริง ต้องใช้มือถือที่รองรับ ARCore หรือ iPhone ที่มี Safari

| ทาง | ใช้กับ | เงื่อนไข | สถานะ |
|---|---|---|---|
| มือถือเปิด `http://<IP ของแล็ปท็อป>:3100` ใน Wi-Fi เดียวกัน (ต้องเปิด dev server ให้ฟังทุกที่อยู่ คำสั่ง `next dev` ฟัง `0.0.0.0` เป็นค่าเริ่มต้น) | ดู 3D | ไม่ใช่ secure context จึงไม่มี WebXR ส่วน Scene Viewer เอกสารบอกให้โหลดไฟล์ผ่าน HTTPS | ดู 3D น่าจะได้ แต่ AR **ยังยืนยันไม่ได้** |
| Android ต่อ USB แล้วใช้ port forwarding ของ Chrome ให้มือถือเปิด `http://localhost:3100` (https://developer.chrome.com/docs/devtools/remote-debugging/local-server) | WebXR บน Android | หน้าเป็น localhost จึงเป็น secure context | ตามเอกสารน่าจะใช้ WebXR ได้ แต่ **ยังไม่ได้ลอง** และ Scene Viewer จะได้ที่อยู่ไฟล์เป็น localhost ของมือถือ **ยังยืนยันไม่ได้** ว่าแอปนั้นเปิดได้ |
| `next dev --experimental-https` (มีใน Next.js 16.4.6 ดูจาก `next dev --help` สร้างใบรับรองแบบ self-signed) | ทุกโหมด | มือถือไม่เชื่อใบรับรองนี้ ถ้าไม่ติดตั้งใบรับรองลงเครื่อง | **ยังยืนยันไม่ได้** |
| tunnel ที่ให้ URL แบบ HTTPS สาธารณะ หรือ deploy ขึ้นเครื่องที่มี HTTPS | ทุกโหมด รวม iPhone | เปิดแอปให้คนภายนอกเข้าได้ ต้องให้เจ้าของอนุญาตก่อน | ทางที่ใกล้ของจริงที่สุด ยังไม่ได้ลอง |

iPhone ไม่มีทาง port forwarding แบบ Android ตามเอกสารที่ตรวจ จึงต้องใช้ทาง IP ใน Wi-Fi หรือ HTTPS การสร้าง USDZ ในเบราว์เซอร์บนหน้าแบบ http จะเปิด Quick Look ได้หรือไม่ **ยังยืนยันไม่ได้**

### B7. ข้อเสนอรุ่นเล็กที่สุดที่ได้ประสบการณ์จริง

1. **ข้อมูล**: migration ใหม่หนึ่งไฟล์ เพิ่มตาราง `product_model_files (key, shop_id, data, created_at)` แบบเดียวกับ `product_image_files` (`src/shared/db/migrations/0002-product-image-files.sql`) และเพิ่มคอลัมน์ `products.model_url TEXT` ที่ว่างได้ ใช้หนึ่งโมเดลต่อหนึ่งสินค้า
2. **ส่งไฟล์**: route `POST /product-models` ลอกแบบ `src/app/product-images/route.ts` (ต้องมีร้าน เช็ก `content-length` เช็กไบต์ตาม B4 แล้วเก็บ) และ `GET /product-models/[key]` ส่ง `Content-Type: model/gltf-binary` `X-Content-Type-Options: nosniff` และ cache แบบ immutable เหมือนรูป
3. **ฟอร์มผู้ขาย**: ช่องไม่บังคับ "ไฟล์ 3 มิติ (.glb ไม่เกิน 10 MB ขนาดจริงหน่วยเมตร)" พร้อมปุ่มเอาออก
4. **หน้าสินค้า**: ถ้า `model_url` มีค่า `ProductGallery` (`src/features/browse/components/product-gallery.tsx`) เพิ่มรูปย่ออีกหนึ่งปุ่ม "ดูแบบ 3 มิติ" ต่อท้ายรูป กดแล้วพื้นที่รูปใหญ่เปลี่ยนเป็น `ProductModel` (B2) ที่ใช้รูปปกเป็น `poster` model-viewer จะโหลดไฟล์เมื่อปุ่มถูกกดเท่านั้น แบบเดียวกับ IKEA ปุ่ม AR ข้างในโผล่เองเฉพาะมือถือที่เปิดได้ สินค้าที่ไม่มีโมเดลไม่เห็นอะไรเพิ่ม เรารู้จากฐานข้อมูลตั้งแต่ตอนเรนเดอร์ ไม่ต้องรอถาม API แบบ IKEA หน้าจึงไม่กระตุก
5. **ค่า model-viewer**: `ar` `ar-scale="fixed"` `camera-controls` `touch-action="pan-y"` (ให้ปัดหน้าขึ้นลงบนมือถือได้) `alt` เป็นชื่อสินค้า ใช้ `ar-modes` ค่าเริ่มต้น เพราะ WebXR เป็นทางเดียวที่ลองบนมือถือ Android ผ่าน localhost ได้ (B6) และ IKEA ไม่ใช้ WebXR จึงไม่มีตัวอย่างจาก IKEA ให้เทียบ
6. **ไลบรารี**: `pnpm add @google/model-viewer three` (three ตรึงตาม peer `^0.183.0`) ทั้งสองเป็นโปรเจกต์ฟรี ไม่เพิ่มค่าใช้จ่าย
7. **ข้อมูลตัวอย่าง**: เก็บไฟล์ CC0 2 ถึง 3 ไฟล์จาก B5 ไว้ใน repo (เช่น GlassVaseFlowers 1.8 MB กับ SheenChair 4.1 MB) แล้วให้ `pnpm seed` ผูกกับสินค้าไม่กี่ชิ้นในหมวดที่เข้ากัน สินค้าอีกเกือบ 1,000 ชิ้นไม่มีโมเดล ซึ่งก็เป็นการลองสถานะ "ไม่มี 3D" ไปในตัว test ยังไม่ต้องใช้อินเทอร์เน็ต
8. **test**: test เล็กของตัวตรวจ GLB (หัวไฟล์ผิด รุ่นผิด ความยาวไม่ตรง เกินขนาด ผ่าน) ตามแบบ test ของ `detectImageType`

ตัดออกจากรุ่นแรก (บอกไว้ให้รู้):

- หน้าต่าง 3D แยกแบบ IKEA พร้อมสลับสี ราคา และปุ่มใส่ตะกร้าในหน้าต่าง
- QR code บน desktop และลิงก์ `?openAr=` ที่เปิด AR ทันที
- โมเดลแยกตามแบบย่อย (สีหรือขนาด) ตอนนี้หนึ่งโมเดลต่อสินค้า
- JSON-LD ชนิด `3DModel` สำหรับเครื่องมือค้นหา
- การตรวจโมเดลละเอียด เช่นจำนวนสามเหลี่ยม ส่วนขยายที่ใช้ ขนาดจริง และการโฮสต์ตัวถอด Draco เอง

---

## สิ่งที่ยังยืนยันไม่ได้

1. AR บน iPhone จริงของ IKEA และของ model-viewer (เราจำลองได้แค่ Chromium ที่ไม่รองรับ `rel="ar"`)
2. AR บน Android จริง เราเห็นแค่ที่อยู่ intent ที่หน้าเว็บพยายามเปิด ไม่เห็นแอป Scene Viewer ทำงาน
3. Scene Viewer เปิดไฟล์ที่บังคับ Draco กับ WebP ได้ทุกเครื่องหรือไม่ (เอกสารไม่ระบุ แต่ IKEA ใช้อยู่)
4. Scene Viewer รับที่อยู่ไฟล์แบบ `http://` ใน Wi-Fi หรือ `localhost` ผ่าน port forwarding ได้หรือไม่ (เอกสารบอกแค่ว่าโหลดไฟล์ผ่าน HTTPS)
5. มือถือเปิด `next dev --experimental-https` แล้วใช้ AR ได้หรือไม่
6. Quick Look กับ USDZ ที่สร้างในเบราว์เซอร์ บนหน้าแบบ http
7. ชนิดข้อมูล TypeScript ของ `<model-viewer>` ใน B2 ยังไม่ได้คอมไพล์จริง และการ bundle `@google/model-viewer` ด้วย Turbopack ยังไม่ได้ลอง
8. หน้า IKEA: หัวเว็บบนมือถือซ่อนหรือโผล่ตอนเลื่อน ลิงก์ขนาดในกล่องซื้อพาไปไหน กดรูปบนมือถือแล้วเกิดอะไร เนื้อหาของ "Looks by you" และรายการใน "Related products"
9. ภาพของโมเดลที่ใช้วัสดุพิเศษ (sheen, transmission) ใน Scene Viewer และ Quick Look

## แหล่งอ้างอิง

IKEA (ดูวันที่ 25 พ.ย. 2026)

- หน้าสินค้า U1 ถึง U6 ตามตารางด้านบน
- โค้ด 3D ของ IKEA: https://www.ikea.com/global/assets/rotera/script-fragment-CP0TQuHR.js, https://www.ikea.com/global/assets/rotera/multi-model-viewer-Bej5HPvB.js, https://www.ikea.com/global/assets/rotera/model-viewer-Bsn1-eVI.js, https://www.ikea.com/global/assets/rotera/model-viewer-rF8pQRm9.js, https://www.ikea.com/global/assets/rotera/USDZExporter-Bc_7yluR.js
- ข้อมูลว่ามีโมเดลไหม (หน้าเว็บเรียกเอง): https://web-api.ikea.com/sg/en/rotera/data/model/70349445/
- ไฟล์โมเดลที่ตัวแสดงโหลด: https://web-api.ikea.com/sg/en/rotera/static/models/70349445-mini.glb (และ 80581919, 20477341)

model-viewer และ AR

- https://registry.npmjs.org/@google%2fmodel-viewer
- https://github.com/google/model-viewer (README ของ `packages/model-viewer`)
- https://modelviewer.dev/docs/index.html (ข้อมูลจาก https://modelviewer.dev/data/docs.json)
- https://modelviewer.dev/docs/faq.html (ข้อมูลจาก https://modelviewer.dev/data/faq.json)
- https://data.jsdelivr.com/v1/packages/npm/@google/model-viewer@4.4.0
- https://developers.google.com/ar/develop/scene-viewer
- https://webkit.org/blog/8421/viewing-augmented-reality-assets-in-safari-for-ios/
- https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API
- https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts
- https://developer.chrome.com/docs/devtools/remote-debugging/local-server

React และ Next.js

- https://react.dev/blog/2024/12/05/react-19
- https://nextjs.org/docs/app/guides/lazy-loading (ฉบับในโปรเจกต์: `node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md`)

ไฟล์ตัวอย่าง

- https://github.com/KhronosGroup/glTF-Sample-Assets (`Models/model-index.json` และ `Models/<ชื่อ>/metadata.json`)
