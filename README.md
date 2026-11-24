# Blanksong (แบลงค์ส่ง)

แพลตฟอร์มซื้อขายของออนไลน์ที่มีหลายร้านในที่เดียว requirement อยู่ที่ [docs/requirements/product.md](docs/requirements/product.md) โครงโค้ดอยู่ที่ [docs/architecture.md](docs/architecture.md)

กฎสำหรับ agent ทุกค่ายอยู่ที่ [AGENTS.md](AGENTS.md) ส่วนเส้นทางงานอยู่ที่ [docs/agent-routing.md](docs/agent-routing.md)

## ติดตั้ง

ต้องมี Node 26 ขึ้นไป และ pnpm ไม่ต้องมีฐานข้อมูลหรือ Docker เพราะใช้ SQLite ที่มากับ Node

```sh
pnpm install
git config core.hooksPath .githooks
```

บรรทัดที่สองเปิด git hook ที่ตรวจก่อน commit ถ้ามีคำที่ห้ามขึ้น repo เช่นชื่อบัญชีอื่นหรืออีเมลจริง ให้ใส่ไว้ใน `.git/info/private-words` หนึ่งคำต่อบรรทัด ไฟล์นี้อยู่ใน `.git/` จึงไม่ถูก commit ทดสอบตัวตรวจด้วย `scripts/agent-checks/test.sh`

## รัน

```sh
pnpm dev
```

เปิด http://localhost:3100 ถ้าพอร์ตนี้ไม่ว่าง ใช้ `PORT=3200 pnpm dev` คำสั่งนี้สร้างข้อมูลตัวอย่างให้เองถ้ายังไม่มี

ฐานข้อมูลอยู่ที่ `data/blanksong.db` เปลี่ยนที่เก็บได้ด้วยค่า `DATABASE_PATH`

### อีเมลตั้งรหัสผ่านใหม่

ไม่ต้องตั้งค่าอะไรก็ใช้ได้ ลิงก์ตั้งรหัสผ่านใหม่จะขึ้นในบันทึกของเซิร์ฟเวอร์ (หน้าจอที่รัน `pnpm dev`) ใต้บรรทัด `[อีเมล]` ถ้าจะส่งอีเมลจริงผ่าน Resend แผนฟรี ให้ตั้งค่าเหล่านี้

| ค่า | ใส่อะไร |
|---|---|
| `RESEND_API_KEY` | API key จากบัญชี Resend |
| `EMAIL_FROM` | ผู้ส่งที่อยู่บนโดเมนที่ยืนยันใน Resend แล้ว เช่น `Blanksong <no-reply@โดเมนของคุณ>` |
| `APP_URL` | ที่อยู่เว็บที่ผู้ใช้เปิด เช่น `https://blanksong.example` ลิงก์ในอีเมลใช้ค่านี้ |

## ข้อมูลตัวอย่าง

```sh
pnpm seed          # สร้างข้อมูลตัวอย่างถ้ายังไม่มี รันซ้ำได้โดยข้อมูลไม่ซ้ำ
pnpm seed --reset  # ลบฐานข้อมูลในเครื่องแล้วสร้างใหม่ทั้งหมด
```

ได้ 12 หมวดหมู่ 50 ร้าน และ 1,000 สินค้าพร้อมแบบย่อยและสต็อก บัญชีตัวอย่างมีดังนี้ รหัสผ่านใช้สาธิตเท่านั้น

| บัญชี | อีเมล | รหัสผ่าน |
|---|---|---|
| ผู้ดูแลแพลตฟอร์ม | `admin@example.com` | `admin1234` |
| ผู้ซื้อ (ยังไม่มีร้าน) | `buyer1@example.com` ถึง `buyer3@example.com` | `demo1234` |
| ผู้ขาย (เจ้าของร้านที่ 1 ถึง 50) | `seller01@example.com` ถึง `seller50@example.com` | `demo1234` |

## ตรวจโค้ด

```sh
pnpm check
```

ตรวจชนิดข้อมูล ตรวจรูปแบบโค้ด และรัน test ทั้งหมด ไม่ต้องต่ออินเทอร์เน็ต
