-- PAY-004 PAY-011 กลับมาหน้ารอผลต้องเห็น QR เดิม แม้ Omise ล่มอยู่ตอนนั้น จึงเก็บที่อยู่รูป QR ไว้เอง
ALTER TABLE payments ADD COLUMN qr_image_url TEXT;
