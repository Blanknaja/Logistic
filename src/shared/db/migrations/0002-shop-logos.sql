-- SHP-008 รูปโลโก้ร้านเก็บในฐานข้อมูล ร้านละรูปล่าสุดรูปเดียว
-- shops.logo_url ชี้มาที่ /shop-logos/<id> รูปใหม่ได้ id ใหม่ เบราว์เซอร์จึงไม่ใช้รูปเก่าที่จำไว้
-- AUTOINCREMENT กัน id ของรูปที่ลบไปแล้วถูกใช้ซ้ำ

CREATE TABLE shop_logos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL REFERENCES shops (id),
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png')),
  data BLOB NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX shop_logos_shop ON shop_logos (shop_id);
