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

/** เนื้อคำขอที่ส่ง bytes มาทีละก้อน 1 MB โดยไม่บอก content-length และนับไบต์ที่เซิร์ฟเวอร์อ่านไป */
export function streamedBody(bytes: Uint8Array) {
  const stats = { sent: 0 };
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (stats.sent >= bytes.byteLength) return controller.close();
      const chunk = bytes.slice(stats.sent, stats.sent + 1024 * 1024);
      stats.sent += chunk.byteLength;
      controller.enqueue(chunk);
    },
  });
  return { body, stats };
}
