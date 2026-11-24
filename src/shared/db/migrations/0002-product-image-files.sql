-- PRD รูปที่ผู้ขายส่งขึ้นมาจากหน้าฟอร์มสินค้า เก็บในฐานข้อมูลเอง ไม่ใช้ระบบภายนอก
-- รูปถูกส่งก่อนกดบันทึกสินค้า จึงผูกกับร้าน ไม่ผูกกับสินค้า
-- key เป็นค่าสุ่ม ที่อยู่ของรูปจึงเดาไม่ได้ แม้รูปของสินค้าที่ยังเป็นร่าง
CREATE TABLE product_image_files (
  key TEXT PRIMARY KEY,
  shop_id INTEGER NOT NULL REFERENCES shops (id),
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png')),
  data BLOB NOT NULL,
  created_at TEXT NOT NULL
);
