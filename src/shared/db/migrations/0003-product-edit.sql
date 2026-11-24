-- PRD-013 หน้าฟอร์มสินค้าใหม่แต่ละครั้งส่งรหัสสุ่มมากับการบันทึก กดบันทึกซ้ำจึงได้สินค้าชิ้นเดียว
ALTER TABLE products ADD COLUMN create_token TEXT;
CREATE UNIQUE INDEX products_create_token ON products (shop_id, create_token) WHERE create_token IS NOT NULL;

-- PRD-010 ตัวเลือกที่ถูกเอาออกตอนแก้สินค้าไม่ลบทิ้ง เพราะแบบย่อยเก่าในตะกร้ายังแสดงค่าตัวเลือกเดิม
ALTER TABLE product_options ADD COLUMN removed_at TEXT;
