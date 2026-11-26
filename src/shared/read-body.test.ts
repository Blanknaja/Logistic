import { describe, expect, test } from "vitest";
import { readBodyUpTo } from "./read-body";

const MB = 1024 * 1024;

/** คำขอที่ส่งเนื้อมาทีละก้อนโดยไม่บอก content-length นับว่าถูกอ่านไปกี่ก้อน */
function chunkedRequest(chunks: number, chunkSize: number) {
  const stats = { pulled: 0, cancelled: false };
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (stats.pulled === chunks) return controller.close();
      stats.pulled++;
      controller.enqueue(new Uint8Array(chunkSize).fill(stats.pulled));
    },
    cancel() {
      stats.cancelled = true;
    },
  });
  const request = new Request("http://localhost/upload", { method: "POST", body, duplex: "half" } as RequestInit);
  return { request, stats };
}

describe("อ่านเนื้อคำขอไม่เกินขนาดที่กำหนด", () => {
  test("เนื้อเกินขนาดที่ไม่บอก content-length ได้ null และหยุดอ่านทันทีที่เกิน ไม่อ่านจนจบ", async () => {
    const { request, stats } = chunkedRequest(30, MB);
    expect(request.headers.get("content-length")).toBeNull();

    expect(await readBodyUpTo(request, 10 * MB)).toBeNull();
    expect(stats.pulled).toBeLessThanOrEqual(12);
    expect(stats.cancelled).toBe(true);
  });

  test("เนื้อที่ไม่เกินขนาด ได้ครบทุกไบต์ตามลำดับ และขนาดพอดีก็รับ", async () => {
    const { request } = chunkedRequest(3, 4);
    expect(await readBodyUpTo(request, 12)).toEqual(new Uint8Array([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3]));

    const { request: over } = chunkedRequest(3, 4);
    expect(await readBodyUpTo(over, 11)).toBeNull();
  });

  test("คำขอที่ไม่มีเนื้อ ได้ไฟล์ว่าง", async () => {
    expect(await readBodyUpTo(new Request("http://localhost/upload", { method: "POST" }), MB)).toEqual(new Uint8Array());
  });
});
