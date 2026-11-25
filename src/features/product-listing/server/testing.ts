// ตัวช่วยของ test ใน feature นี้ โค้ดของแอปไม่ใช้

/** ไฟล์ที่ส่วนหัวเป็น GLB รุ่น 2 ขนาดตามที่ต้องการ (P3D-001) */
export function fakeGlb(size = 100): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  bytes.set([0x67, 0x6c, 0x54, 0x46]);
  view.setUint32(4, 2, true);
  view.setUint32(8, size, true);
  return bytes;
}
