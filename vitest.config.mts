import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    // test ที่ต่อ Omise จริงรันด้วย pnpm test:omise เท่านั้น pnpm check ต้องไม่ใช้อินเทอร์เน็ต
    exclude: [...configDefaults.exclude, "src/**/*.omise.test.ts"],
  },
});
