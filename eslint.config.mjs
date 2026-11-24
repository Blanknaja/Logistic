import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const tests = ["src/**/*.test.ts", "src/**/*.test.tsx"];

const noBuilders = {
  regex: "(^|/)db/builders$",
  message: "builders ข้ามกฎของธุรกิจ ใช้ได้เฉพาะใน test และข้อมูลตัวอย่าง",
};

const noPages = {
  regex: "^(next|react|react-dom)(/.*)?$",
  message: "โมดูลกฎของธุรกิจต้องไม่รู้จักหน้าเว็บ (docs/adr/0001) ย้ายส่วนที่ใช้ next หรือ react ไปไว้ในหน้าหรือ actions.ts",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // รูปทั้งหมดเป็นไฟล์ในเครื่องหรือ SVG ของข้อมูลตัวอย่าง ซึ่ง next/image ไม่รับ SVG ถ้าไม่ตั้งค่าเพิ่ม
    rules: { "@next/next/no-img-element": "off" },
  },
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    ignores: [...tests, "src/shared/seed/**"],
    rules: { "no-restricted-imports": ["error", { patterns: [noBuilders] }] },
  },
  {
    files: ["src/features/*/server/**/*.ts", "src/shared/db/**/*.ts"],
    ignores: tests,
    rules: { "no-restricted-imports": ["error", { patterns: [noBuilders, noPages] }] },
  },
  {
    files: ["src/app/**", "src/features/*/components/**", "src/shared/layout/**", "src/shared/ui/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name=/^(prepare|exec)$/]",
          message: "หน้าเว็บห้ามเขียน SQL เอง ให้เรียกฟังก์ชันใน src/features/<feature>/server/ (docs/adr/0001)",
        },
      ],
    },
  },
  globalIgnores([".claude/**", ".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
