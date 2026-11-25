-- MAP จังหวัดของแต่ละรายการในประวัติการจัดส่ง ว่างในรายการที่บันทึกก่อนมีช่องนี้ และไม่เติมย้อนหลัง (MAP-007)
ALTER TABLE parcel_history ADD COLUMN province TEXT;
