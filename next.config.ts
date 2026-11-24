import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // กฎของ agent อยู่ใน AGENTS.md ที่คนดูแลเอง ไม่ให้ next dev เขียนทับ
  agentRules: false,
};

export default nextConfig;
