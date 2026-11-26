-- REV รีวิวและให้คะแนน

-- หนึ่งรายการในคำสั่งซื้อมีได้หนึ่งรีวิว (REV-003) คำตอบของร้านและการซ่อนมีได้อย่างละหนึ่งต่อรีวิว จึงอยู่ในแถวเดียวกัน
-- shop_id เป็นร้านตอนที่สั่ง คะแนนของร้านจึงยังนับรีวิวของสินค้าที่ร้านลบไปแล้ว (REV-013)
CREATE TABLE reviews (
  id INTEGER PRIMARY KEY,
  order_item_id INTEGER NOT NULL UNIQUE REFERENCES order_items (id),
  buyer_account_id INTEGER NOT NULL REFERENCES accounts (id),
  product_id INTEGER NOT NULL REFERENCES products (id),
  shop_id INTEGER NOT NULL REFERENCES shops (id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'แสดงอยู่' CHECK (status IN ('แสดงอยู่', 'ถูกซ่อน')),
  created_at TEXT NOT NULL,
  edited_at TEXT,
  reply_body TEXT,
  replied_at TEXT,
  reply_edited_at TEXT,
  hidden_reason TEXT,
  hidden_at TEXT,
  hidden_by_account_id INTEGER REFERENCES accounts (id)
);
CREATE INDEX reviews_product ON reviews (product_id, status, created_at);
CREATE INDEX reviews_shop ON reviews (shop_id, created_at);
CREATE INDEX reviews_created ON reviews (created_at);

CREATE TABLE review_images (
  id INTEGER PRIMARY KEY,
  review_id INTEGER NOT NULL REFERENCES reviews (id),
  url TEXT NOT NULL,
  position INTEGER NOT NULL
);
CREATE INDEX review_images_review ON review_images (review_id, position);

-- รูปที่ผู้ซื้อส่งขึ้นมาจากหน้าเขียนรีวิว ส่งก่อนกดส่งรีวิว จึงผูกกับบัญชี ไม่ผูกกับรีวิว
CREATE TABLE review_image_files (
  key TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts (id),
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png')),
  data BLOB NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX review_image_files_account ON review_image_files (account_id, created_at);
