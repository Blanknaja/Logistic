"use client";

import { useState } from "react";

/** ตัวเลขบนไอคอนตะกร้า เด้งหนึ่งครั้งเมื่อจำนวนเปลี่ยนหลังเปิดหน้า ไม่เด้งตอนเปิดหน้า */
export function CartCount({ count }: { count: number }) {
  const [settled, setSettled] = useState(count);
  if (count === 0) return null;
  return (
    <span
      key={count}
      className={settled === count ? "cart-count" : "cart-count cart-count-bump"}
      onAnimationEnd={() => setSettled(count)}
    >
      {count}
    </span>
  );
}
