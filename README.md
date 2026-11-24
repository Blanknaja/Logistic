# Logistic

ระบบ Logistic ตอนนี้อยู่ในขั้นเก็บ requirement ดูที่ [docs/requirements/product.md](docs/requirements/product.md)

กฎสำหรับ agent ทุกค่ายอยู่ที่ [AGENTS.md](AGENTS.md) ส่วนเส้นทางงานอยู่ที่ [docs/agent-routing.md](docs/agent-routing.md)

## ตั้งค่าหลัง clone

เปิด git hook ที่ตรวจก่อน commit:

```sh
git config core.hooksPath .githooks
```

ถ้ามีคำที่ห้ามขึ้น repo เช่นชื่อบัญชีอื่นหรืออีเมลจริง ให้ใส่ไว้ใน `.git/info/private-words` หนึ่งคำต่อบรรทัด ไฟล์นี้อยู่ใน `.git/` จึงไม่ถูก commit

ทดสอบตัวตรวจด้วย `scripts/agent-checks/test.sh`
