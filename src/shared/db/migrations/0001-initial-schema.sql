-- โครงข้อมูลตั้งต้นของ feature ชุด 1 ทั้ง 10 ตัว ตามส่วน "ข้อมูลและสถานะ" ใน docs/requirements/
-- ห้ามแก้ไฟล์นี้ ถ้าต้องเปลี่ยนโครงข้อมูล ให้เพิ่มไฟล์ใหม่ (ดู docs/architecture.md)
-- เวลาเก็บเป็นข้อความ ISO 8601 แบบ UTC เช่น 2026-11-24T09:00:00.000Z
-- เงินเก็บเป็นจำนวนเต็มบาท

-- ACC บัญชีและเข้าสู่ระบบ ------------------------------------------------

CREATE TABLE accounts (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  phone TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'ใช้งานได้' CHECK (status IN ('ใช้งานได้', 'ถูกระงับ')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- การเข้าสู่ระบบของแต่ละเครื่อง เก็บแค่ค่า hash ของ token ที่อยู่ใน cookie
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts (id),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX sessions_account ON sessions (account_id);

CREATE TABLE password_reset_tokens (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts (id),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX password_reset_tokens_account ON password_reset_tokens (account_id);

-- จำนวนครั้งที่เข้าสู่ระบบผิด นับจากแถวของอีเมลนั้นในช่วง 15 นาทีล่าสุด
CREATE TABLE login_failures (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  failed_at TEXT NOT NULL
);
CREATE INDEX login_failures_email ON login_failures (email, failed_at);

-- SHP ร้าน ----------------------------------------------------------------

CREATE TABLE shops (
  id INTEGER PRIMARY KEY,
  owner_account_id INTEGER NOT NULL UNIQUE REFERENCES accounts (id),
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  description TEXT NOT NULL DEFAULT '',
  logo_url TEXT,
  origin_sender_name TEXT NOT NULL,
  origin_phone TEXT NOT NULL,
  origin_address TEXT NOT NULL,
  origin_subdistrict TEXT NOT NULL,
  origin_district TEXT NOT NULL,
  origin_province TEXT NOT NULL,
  origin_postcode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'เปิดอยู่' CHECK (status IN ('เปิดอยู่', 'ถูกระงับ')),
  opened_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- PRD สินค้า --------------------------------------------------------------

-- หมวดหมู่ของแพลตฟอร์ม ผู้ขายเพิ่มหรือแก้ไม่ได้
CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  position INTEGER NOT NULL
);
INSERT INTO categories (id, name, position) VALUES
  (1, 'เสื้อผ้าและแฟชั่น', 1),
  (2, 'กระเป๋าและรองเท้า', 2),
  (3, 'ความงามและของใช้ส่วนตัว', 3),
  (4, 'มือถือและอุปกรณ์เสริม', 4),
  (5, 'คอมพิวเตอร์และเครื่องใช้ไฟฟ้า', 5),
  (6, 'บ้านและของใช้ในบ้าน', 6),
  (7, 'อาหารและเครื่องดื่ม', 7),
  (8, 'แม่และเด็ก', 8),
  (9, 'กีฬาและกิจกรรมกลางแจ้ง', 9),
  (10, 'หนังสือและเครื่องเขียน', 10),
  (11, 'สัตว์เลี้ยง', 11),
  (12, 'อื่นๆ', 12);

-- ร่างมีแค่ชื่อก็ได้ หมวดหมู่จึงว่างได้
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  shop_id INTEGER NOT NULL REFERENCES shops (id),
  category_id INTEGER REFERENCES categories (id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('ร่าง', 'ขายอยู่', 'ซ่อน', 'ลบแล้ว')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  -- เวลาที่ลงขาย ใช้เรียง "ใหม่ล่าสุด" ใน BRW
  published_at TEXT,
  deleted_at TEXT
);
CREATE INDEX products_shop ON products (shop_id, status);
CREATE INDEX products_listing ON products (status, published_at);
CREATE INDEX products_category ON products (category_id, status);

-- รูปลำดับ 0 คือรูปปก ไฟล์รูปไม่ลบ เพราะคำสั่งซื้อเดิมยังชี้ถึงรูปปกของตัวเอง
CREATE TABLE product_images (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products (id),
  url TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX product_images_product ON product_images (product_id, position);

-- ตัวเลือก เช่น สี หรือ ขนาด ไม่เกิน 2 ตัวเลือกต่อสินค้า
CREATE TABLE product_options (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products (id),
  name TEXT NOT NULL,
  position INTEGER NOT NULL
);
CREATE INDEX product_options_product ON product_options (product_id, position);

-- ค่าตัวเลือก เช่น แดง หรือ M
CREATE TABLE product_option_values (
  id INTEGER PRIMARY KEY,
  option_id INTEGER NOT NULL REFERENCES product_options (id),
  value TEXT NOT NULL,
  position INTEGER NOT NULL
);
CREATE INDEX product_option_values_option ON product_option_values (option_id, position);

-- แบบย่อย สินค้าที่ไม่มีตัวเลือกมีหนึ่งแถวที่ค่าตัวเลือกว่างทั้งสองช่อง
-- แบบย่อยที่เลิกใช้ไม่ลบทิ้ง เพราะตะกร้าและประวัติสต็อกยังอ้างถึง
-- ราคาว่างได้เฉพาะสินค้าที่ยังเป็นร่าง
CREATE TABLE variants (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products (id),
  option_value1_id INTEGER REFERENCES product_option_values (id),
  option_value2_id INTEGER REFERENCES product_option_values (id),
  price INTEGER,
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  removed_at TEXT
);
CREATE INDEX variants_product ON variants (product_id, position);

-- INV ประวัติสต็อก แก้และลบไม่ได้ ----------------------------------------

CREATE TABLE stock_history (
  id INTEGER PRIMARY KEY,
  variant_id INTEGER NOT NULL REFERENCES variants (id),
  reason TEXT NOT NULL CHECK (reason IN ('ผู้ขายแก้', 'จองจากคำสั่งซื้อ', 'คืนจากคำสั่งซื้อ')),
  change INTEGER NOT NULL,
  stock_after INTEGER NOT NULL,
  order_id INTEGER REFERENCES orders (id),
  created_at TEXT NOT NULL
);
CREATE INDEX stock_history_variant ON stock_history (variant_id, created_at);

-- CRT ตะกร้า หนึ่งบัญชีมีหนึ่งตะกร้า ตะกร้าคือรายการทั้งหมดของบัญชีนั้น --------

CREATE TABLE cart_items (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts (id),
  variant_id INTEGER NOT NULL REFERENCES variants (id),
  quantity INTEGER NOT NULL CHECK (quantity >= 1),
  selected INTEGER NOT NULL DEFAULT 1 CHECK (selected IN (0, 1)),
  last_seen_price INTEGER NOT NULL,
  last_seen_name TEXT NOT NULL,
  last_seen_image_url TEXT,
  added_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (account_id, variant_id)
);

-- CHK ที่อยู่จัดส่งและคำสั่งซื้อ -------------------------------------------

CREATE TABLE shipping_addresses (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts (id),
  recipient_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  subdistrict TEXT NOT NULL,
  district TEXT NOT NULL,
  province TEXT NOT NULL,
  postcode TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX shipping_addresses_account ON shipping_addresses (account_id);
CREATE UNIQUE INDEX shipping_addresses_one_default ON shipping_addresses (account_id) WHERE is_default = 1;

-- กลุ่มคำสั่งซื้อ: ทุกคำสั่งซื้อจากการกดสั่งซื้อครั้งเดียว จ่ายและหมดเวลาพร้อมกัน
CREATE TABLE order_groups (
  id INTEGER PRIMARY KEY,
  buyer_account_id INTEGER NOT NULL REFERENCES accounts (id),
  total INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  payment_deadline TEXT NOT NULL
);
CREATE INDEX order_groups_buyer ON order_groups (buyer_account_id);

-- คำสั่งซื้อ: หนึ่งร้านต่อหนึ่งคำสั่งซื้อ ที่อยู่จัดส่งเป็นสำเนาตอนสั่ง
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  order_no TEXT NOT NULL UNIQUE,
  group_id INTEGER NOT NULL REFERENCES order_groups (id),
  buyer_account_id INTEGER NOT NULL REFERENCES accounts (id),
  shop_id INTEGER NOT NULL REFERENCES shops (id),
  status TEXT NOT NULL CHECK (status IN ('รอจ่ายเงิน', 'จ่ายแล้ว', 'กำลังจัดส่ง', 'สำเร็จ', 'ยกเลิก')),
  items_total INTEGER NOT NULL,
  shipping_fee INTEGER NOT NULL,
  total INTEGER NOT NULL,
  ship_recipient_name TEXT NOT NULL,
  ship_phone TEXT NOT NULL,
  ship_address TEXT NOT NULL,
  ship_subdistrict TEXT NOT NULL,
  ship_district TEXT NOT NULL,
  ship_province TEXT NOT NULL,
  ship_postcode TEXT NOT NULL,
  ordered_at TEXT NOT NULL,
  paid_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT,
  cancel_reason TEXT
);
CREATE INDEX orders_group ON orders (group_id);
CREATE INDEX orders_buyer ON orders (buyer_account_id, ordered_at);
CREATE INDEX orders_shop ON orders (shop_id, status, ordered_at);

-- สินค้าในคำสั่งซื้อ เป็นสำเนาตอนสั่ง ร้านแก้สินค้าทีหลังไม่กระทบ
CREATE TABLE order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders (id),
  product_id INTEGER NOT NULL REFERENCES products (id),
  variant_id INTEGER NOT NULL REFERENCES variants (id),
  product_name TEXT NOT NULL,
  variant_label TEXT NOT NULL DEFAULT '',
  unit_price INTEGER NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity >= 1),
  cover_image_url TEXT
);
CREATE INDEX order_items_order ON order_items (order_id);
CREATE INDEX order_items_variant ON order_items (variant_id);

-- PAY การจ่ายเงิน: ความพยายามจ่ายหนึ่งครั้งของหนึ่งกลุ่มคำสั่งซื้อ ----------

CREATE TABLE payments (
  id INTEGER PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES order_groups (id),
  amount INTEGER NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('บัตร', 'PromptPay')),
  status TEXT NOT NULL CHECK (status IN ('รอผล', 'สำเร็จ', 'ไม่สำเร็จ', 'เลิกรอ', 'สำเร็จแต่ไม่ถูกใช้')),
  omise_charge_id TEXT UNIQUE,
  failure_reason TEXT,
  card_last4 TEXT,
  started_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX payments_group ON payments (group_id);
-- หนึ่งกลุ่มมีการจ่ายเงินที่รอผลได้ครั้งละรายการ และสำเร็จได้รายการเดียว
CREATE UNIQUE INDEX payments_one_pending ON payments (group_id) WHERE status = 'รอผล';
CREATE UNIQUE INDEX payments_one_success ON payments (group_id) WHERE status = 'สำเร็จ';

-- ยอดของแต่ละคำสั่งซื้อในการจ่ายเงินหนึ่งครั้ง
CREATE TABLE payment_orders (
  payment_id INTEGER NOT NULL REFERENCES payments (id),
  order_id INTEGER NOT NULL REFERENCES orders (id),
  amount INTEGER NOT NULL,
  PRIMARY KEY (payment_id, order_id)
);
CREATE INDEX payment_orders_order ON payment_orders (order_id);

-- DLV พัสดุ: หนึ่งคำสั่งซื้อมีหนึ่งพัสดุ ------------------------------------

CREATE TABLE parcels (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL UNIQUE REFERENCES orders (id),
  tracking_no TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('รอร้านจัดของ', 'ร้านส่งของแล้ว', 'อยู่ระหว่างขนส่ง', 'กำลังนำส่ง', 'ส่งสำเร็จ', 'ส่งไม่สำเร็จ')),
  origin_sender_name TEXT NOT NULL,
  origin_phone TEXT NOT NULL,
  origin_address TEXT NOT NULL,
  origin_subdistrict TEXT NOT NULL,
  origin_district TEXT NOT NULL,
  origin_province TEXT NOT NULL,
  origin_postcode TEXT NOT NULL,
  receiver_name TEXT,
  failure_reason TEXT,
  delivered_at TEXT,
  receipt_confirmed_at TEXT,
  receipt_confirmed_by TEXT CHECK (receipt_confirmed_by IN ('ผู้ซื้อ', 'ระบบ')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX parcels_status ON parcels (status, delivered_at);

-- ประวัติการจัดส่ง แก้และลบไม่ได้ บัญชีที่เปลี่ยนว่างเมื่อระบบเป็นคนเปลี่ยน
CREATE TABLE parcel_history (
  id INTEGER PRIMARY KEY,
  parcel_id INTEGER NOT NULL REFERENCES parcels (id),
  status TEXT NOT NULL CHECK (status IN ('รอร้านจัดของ', 'ร้านส่งของแล้ว', 'อยู่ระหว่างขนส่ง', 'กำลังนำส่ง', 'ส่งสำเร็จ', 'ส่งไม่สำเร็จ')),
  location TEXT NOT NULL DEFAULT '',
  changed_by_account_id INTEGER REFERENCES accounts (id),
  created_at TEXT NOT NULL
);
CREATE INDEX parcel_history_parcel ON parcel_history (parcel_id, created_at);
