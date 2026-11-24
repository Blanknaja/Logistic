-- CHK-005 ถึง CHK-008 กดสั่งซื้อและหมดเวลาจ่ายเงิน

-- กดสั่งซื้อซ้ำจากหน้าสั่งซื้อเดียวกันต้องได้กลุ่มคำสั่งซื้อเดิม (CHK-007)
-- ว่างได้ สำหรับกลุ่มที่สร้างจากข้อมูลตัวอย่างหรือ test
ALTER TABLE order_groups ADD COLUMN order_key TEXT;
CREATE UNIQUE INDEX order_groups_order_key ON order_groups (buyer_account_id, order_key);

-- รอบตรวจหมดเวลาจ่ายเงินหาเฉพาะคำสั่งซื้อที่ยังรอจ่ายเงิน ซึ่งมีน้อยเสมอ
CREATE INDEX orders_status_group ON orders (status, group_id);
