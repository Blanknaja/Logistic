"use client";

import { useEffect, useState, type CSSProperties } from "react";

const PIECES = Array.from({ length: 12 }, (_, index) => {
  const angle = (index / 12) * 2 * Math.PI;
  const distance = index % 2 === 0 ? 96 : 64;
  return {
    "--x": `${Math.round(Math.cos(angle) * distance)}px`,
    "--y": `${Math.round(Math.sin(angle) * distance - 24)}px`,
    "--r": `${index % 2 === 0 ? 200 : -160}deg`,
  } as CSSProperties;
});

/**
 * เครื่องหมายถูกในวงกลมเขียวของหน้าที่สำเร็จ เครื่องหมายเห็นเสมอ
 * กระดาษสีเล่นครั้งเดียวต่อ onceKey ในเบราว์เซอร์นี้ เปิดหน้าเดิมซ้ำจึงไม่ฉลองซ้ำ
 */
export function Celebrate({ onceKey }: { onceKey: string }) {
  const [confetti, setConfetti] = useState(false);
  useEffect(() => {
    const key = `celebrated:${onceKey}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {
      return;
    }
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) setConfetti(true);
  }, [onceKey]);

  return (
    <span className="celebrate" aria-hidden="true">
      <svg viewBox="0 0 48 48" width="40" height="40" focusable="false">
        <path className="draw" pathLength="1" d="M12 25l8 8 16-18" />
      </svg>
      {confetti && PIECES.map((style, index) => <span key={index} className="confetti" style={style} />)}
    </span>
  );
}
