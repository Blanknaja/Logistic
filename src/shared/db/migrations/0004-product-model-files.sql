-- P3D ไฟล์ 3 มิติที่ผู้ขายส่งขึ้นมา เก็บแบบเดียวกับ product_image_files: ส่งก่อนกดบันทึกสินค้า จึงผูกกับร้าน และ key เป็นค่าสุ่ม
-- name คือชื่อไฟล์เดิม ให้ผู้ขายเห็นในหน้าฟอร์มว่าใส่ไฟล์ไหนไว้
CREATE TABLE product_model_files (
  key TEXT PRIMARY KEY,
  shop_id INTEGER NOT NULL REFERENCES shops (id),
  name TEXT NOT NULL,
  data BLOB NOT NULL,
  created_at TEXT NOT NULL
);

-- สินค้าละไม่เกินหนึ่งไฟล์ ว่างคือไม่มีไฟล์ 3 มิติ
ALTER TABLE products ADD COLUMN model_url TEXT;
