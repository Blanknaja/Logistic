import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// pnpm test:omise ยิงไปที่ Omise โหมดทดลองจริง ด้วยกุญแจจาก .env.local หรือค่าที่ตั้งไว้แล้ว ไม่อยู่ใน pnpm check
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.omise.test.ts"],
    env: { OMISE_PUBLIC_KEY: process.env.OMISE_PUBLIC_KEY ?? "", OMISE_SECRET_KEY: process.env.OMISE_SECRET_KEY ?? "" },
    testTimeout: 60_000,
  },
});
