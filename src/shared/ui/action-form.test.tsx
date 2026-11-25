import { redirect } from "next/navigation";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ACTION_FAILED, Field, SubmitButton } from "@/shared/ui/action-form";
import { ACTION_TIMEOUT_MS, withTimeout } from "@/shared/ui/timeout";

afterEach(() => {
  vi.useRealTimers();
});

const never = () => new Promise<never>(() => {});
// withTimeout ไม่ใช้ผลครั้งก่อน
const previous = { failed: true } as const;

describe("ACC-014 ระหว่างรอผลและเมื่อไม่ได้ผล", () => {
  test("ACC-014 ระหว่างรอผล ปุ่มเปลี่ยนเป็นกำลังสมัครและกดซ้ำไม่ได้", () => {
    const html = renderToStaticMarkup(<SubmitButton pending label="สมัครบัญชี" pendingLabel="กำลังสมัคร..." />);
    expect(html).toContain("กำลังสมัคร...");
    expect(html).toContain("disabled");

    const idle = renderToStaticMarkup(<SubmitButton pending={false} label="สมัครบัญชี" pendingLabel="กำลังสมัคร..." />);
    expect(idle).toContain("สมัครบัญชี");
    expect(idle).not.toContain("disabled");
  });

  test("ACC-014 ได้ผลทันเวลา ส่งผลของ server action ต่อตามเดิม", async () => {
    const result = await withTimeout(async () => ({ errors: { phone: "ผิด" } }))(previous, new FormData());
    expect(result).toEqual({ errors: { phone: "ผิด" } });
  });

  test("ACC-014 ไม่ได้ผลใน 10 วินาที ได้ผลว่าไม่สำเร็จ", async () => {
    vi.useFakeTimers();
    const pending = withTimeout(never)(previous, new FormData());

    await vi.advanceTimersByTimeAsync(ACTION_TIMEOUT_MS - 1);
    let settled = false;
    void pending.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ failed: true });
    expect(ACTION_FAILED).toBe("ทำรายการไม่สำเร็จ กรุณาลองใหม่");
  });

  test("ACC-014 เน็ตหลุดระหว่างส่ง ได้ผลว่าไม่สำเร็จแทนหน้าผิดพลาด", async () => {
    const offline = withTimeout(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await offline(previous, new FormData())).toEqual({ failed: true });
  });

  test("ACC-014 server action สั่งพาไปหน้าอื่น ต้องปล่อยให้ Next.js พาไป ไม่นับเป็นไม่สำเร็จ", async () => {
    const redirecting = withTimeout(async () => redirect("/"));
    await expect(redirecting(previous, new FormData())).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT") });
  });
});

describe("ACC-002 ข้อความใต้ช่องที่ผิด", () => {
  test("ACC-002 ช่องที่ผิดแสดงเหตุผลใต้ช่อง และผูกกับช่องให้โปรแกรมอ่านหน้าจอ", () => {
    const html = renderToStaticMarkup(<Field label="อีเมล" name="email" error="รูปแบบอีเมลไม่ถูกต้อง" />);
    expect(html).toContain('aria-describedby="field-email-error"');
    expect(html).toContain('id="field-email-error"');
    expect(html).toContain("รูปแบบอีเมลไม่ถูกต้อง");
  });

  test("ACC-002 ช่องที่ถูกไม่มีข้อความผิด", () => {
    const html = renderToStaticMarkup(<Field label="อีเมล" name="email" />);
    expect(html).not.toContain("aria-invalid");
    expect(html).not.toContain("field-error");
  });
});
