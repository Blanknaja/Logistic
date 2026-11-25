import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // กฎของ agent อยู่ใน AGENTS.md ที่คนดูแลเอง ไม่ให้ next dev เขียนทับ
  agentRules: false,
  experimental: {
    // โลโก้ร้านไม่เกิน 2 MB ส่งมาพร้อมช่องอื่นของฟอร์ม (SHP-008) ค่าเริ่มต้นรับแค่ 1 MB
    serverActions: { bodySizeLimit: "3mb" },
  },
};

export default nextConfig;
