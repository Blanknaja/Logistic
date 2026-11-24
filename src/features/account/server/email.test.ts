import { afterEach, expect, test, vi } from "vitest";
import { sendEmail } from "@/features/account/server/email";

const message = {
  to: "somchai@example.com",
  subject: "ตั้งรหัสผ่านใหม่",
  text: "https://blanksong.example/reset-password?token=abc",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function configure(apiKey: string, from: string) {
  vi.stubEnv("RESEND_API_KEY", apiKey);
  vi.stubEnv("EMAIL_FROM", from);
}

test("ACC-Q05 ยังไม่ได้ตั้งค่าระบบส่งอีเมล ลิงก์ถูกเขียนลงบันทึกของเซิร์ฟเวอร์ทันที โดยไม่ต่อระบบภายนอก", async () => {
  configure("", "");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const log = vi.spyOn(console, "info").mockImplementation(() => {});

  await sendEmail(message);

  expect(fetch).not.toHaveBeenCalled();
  expect(log).toHaveBeenCalledTimes(1);
  expect(log.mock.calls[0][0]).toContain("somchai@example.com");
  expect(log.mock.calls[0][0]).toContain(message.text);
});

test("ACC-Q05 ตั้งค่าแล้ว ส่งอีเมลผ่าน Resend ทันที 1 ครั้ง และไม่รอเกิน 10 วินาที", async () => {
  configure("re_test", "Blanksong <no-reply@blanksong.example>");
  const fetch = vi.fn(async () => Response.json({ id: "1" }));
  vi.stubGlobal("fetch", fetch);

  await sendEmail(message);

  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("https://api.resend.com/emails");
  expect(init.method).toBe("POST");
  expect(init.headers).toMatchObject({ Authorization: "Bearer re_test" });
  expect(JSON.parse(String(init.body))).toEqual({ from: "Blanksong <no-reply@blanksong.example>", ...message });
  expect(init.signal).toBeInstanceOf(AbortSignal);
});

test("ACC-Q05 ระบบส่งอีเมลตอบว่าผิดพลาด โยน error ให้บันทึกของเซิร์ฟเวอร์เห็น", async () => {
  configure("re_test", "no-reply@blanksong.example");
  vi.stubGlobal("fetch", vi.fn(async () => new Response("domain not verified", { status: 403 })));

  await expect(sendEmail(message)).rejects.toThrow(/403/);
});
