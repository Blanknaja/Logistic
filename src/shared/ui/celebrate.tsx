"use client";

import { useEffect, useRef } from "react";

const PIECES = 12;

/**
 * เครื่องหมายถูกในวงกลมเขียวของหน้าที่สำเร็จ เครื่องหมายเห็นเสมอ
 * กระดาษสีเล่นครั้งเดียวต่อ onceKey ในเบราว์เซอร์นี้ เปิดหน้าเดิมซ้ำจึงไม่ฉลองซ้ำ
 */
export function Celebrate({ onceKey }: { onceKey: string }) {
  const mark = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const key = `celebrated:${onceKey}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {
      return;
    }
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const pieces = Array.from({ length: PIECES }, (_, index) => {
      const angle = (index / PIECES) * 2 * Math.PI;
      const distance = index % 2 === 0 ? 96 : 64;
      const piece = document.createElement("span");
      piece.className = "confetti";
      piece.style.setProperty("--x", `${Math.round(Math.cos(angle) * distance)}px`);
      piece.style.setProperty("--y", `${Math.round(Math.sin(angle) * distance - 24)}px`);
      piece.style.setProperty("--r", `${index % 2 === 0 ? 200 : -160}deg`);
      return piece;
    });
    mark.current?.append(...pieces);
    return () => pieces.forEach((piece) => piece.remove());
  }, [onceKey]);

  return (
    <span ref={mark} className="celebrate" aria-hidden="true">
      <svg viewBox="0 0 48 48" width="40" height="40" focusable="false">
        <path className="draw" pathLength="1" d="M12 25l8 8 16-18" />
      </svg>
    </span>
  );
}
