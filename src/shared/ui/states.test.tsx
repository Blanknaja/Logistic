import Link from "next/link";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { EmptyState, ErrorState, LoadingState, NotFoundState } from "@/shared/ui/states";

describe("หน้าสถานะกลาง", () => {
  test("หน้าว่างแสดงหัวข้อ ข้อความ และปุ่มที่ส่งมา", () => {
    const html = renderToStaticMarkup(
      <EmptyState title="ตะกร้ายังว่าง" message="ลองเลือกสินค้าจากหน้าแรก">
        <Link href="/">ไปหน้าแรก</Link>
      </EmptyState>,
    );
    expect(html).toContain("ตะกร้ายังว่าง");
    expect(html).toContain("ลองเลือกสินค้าจากหน้าแรก");
    expect(html).toContain('href="/"');
  });

  test("หน้ากำลังโหลดบอกโปรแกรมอ่านหน้าจอด้วย", () => {
    const html = renderToStaticMarkup(<LoadingState />);
    expect(html).toContain("กำลังโหลด");
    expect(html).toContain('role="status"');
  });

  test("หน้าผิดพลาดใช้ข้อความตาม requirement เป็นค่าเริ่มต้น", () => {
    const html = renderToStaticMarkup(<ErrorState action={<button type="button">ลองใหม่</button>} />);
    expect(html).toContain("โหลดข้อมูลไม่สำเร็จ");
    expect(html).toContain("ลองใหม่");
    expect(html).toContain('role="alert"');
  });

  test("กล่องที่เป็นเนื้อหาทั้งหน้ามี h1 กล่องที่วางในหน้าที่มี h1 แล้วเป็น h2", () => {
    expect(renderToStaticMarkup(<NotFoundState />)).toContain('<h1 class="state-title">ไม่พบ</h1>');
    expect(renderToStaticMarkup(<ErrorState action={null} />)).toContain("<h1");
    expect(renderToStaticMarkup(<LoadingState />)).toContain("<h1");
    expect(renderToStaticMarkup(<EmptyState title="ว่าง" />)).toContain("<h2");
    expect(renderToStaticMarkup(<EmptyState level={1} title="ว่าง" />)).toContain("<h1");
    expect(renderToStaticMarkup(<ErrorState level={2} action={null} />)).toContain("<h2");
  });

  test('หน้า "ไม่พบ" มีลิงก์กลับหน้าแรก และเปลี่ยนหัวข้อได้', () => {
    expect(renderToStaticMarkup(<NotFoundState />)).toContain("ไม่พบ");
    const html = renderToStaticMarkup(<NotFoundState title="ไม่พบสินค้านี้" />);
    expect(html).toContain("ไม่พบสินค้านี้");
    expect(html).toContain('href="/"');
    expect(html).toContain("กลับหน้าแรก");
  });
});
