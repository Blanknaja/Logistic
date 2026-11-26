import { defineConfig } from "@playwright/test";

// pnpm e2e build แอปแล้วเปิดแบบ production กับฐานข้อมูลของ e2e เอง (data/e2e.db) ที่ล้างใหม่ทุกครั้ง ฐานข้อมูลที่ใช้ลองแอปจึงไม่ถูกแตะ
const port = Number(process.env.E2E_PORT ?? 3300);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "e2e",
  timeout: 5 * 60 * 1000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    // ใช้ Google Chrome ที่ติดตั้งในเครื่อง ถ้าไม่มี ให้รัน `pnpm exec playwright install chromium` แล้วตั้ง E2E_BROWSER=chromium
    channel: process.env.E2E_BROWSER === "chromium" ? undefined : "chrome",
    locale: "th-TH",
    timezoneId: "Asia/Bangkok",
    viewport: { width: 1280, height: 800 },
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `next build && tsx scripts/seed.ts --reset && next start -p ${port}`,
    url: baseURL,
    // ค่าว่างชนะกุญแจใน .env.local จึงใช้ตัวจำลองการจ่ายเงินเสมอ e2e ไม่ต่อ Omise จริง
    env: { DATABASE_PATH: "data/e2e.db", PORT: String(port), OMISE_PUBLIC_KEY: "", OMISE_SECRET_KEY: "" },
    reuseExistingServer: false,
    timeout: 5 * 60 * 1000,
  },
});
