"use client";

import { useEffect, useRef, useState } from "react";
import type { ParcelScene, SceneColors } from "./parcel-scene";
import { RouteArt } from "./route-art";
import styles from "./home.module.css";

const token = (element: Element, name: string) => getComputedStyle(element).getPropertyValue(name).trim();

function sceneColors(element: Element): SceneColors {
  return {
    ground: token(element, "--tint-1"),
    shop: token(element, "--tint-2"),
    home: token(element, "--tint-3"),
    roof: token(element, "--color-sale"),
    parcel: token(element, "--color-accent"),
    ink: token(element, "--color-ink"),
    leaf: token(element, "--color-primary"),
    light: token(element, "--color-surface"),
  };
}

/**
 * ภาพของส่วนต้อนรับ เริ่มจากภาพ SVG ที่เห็นได้ทันที จอกว้าง 900 ขึ้นไปที่ไม่ได้ขอลดการขยับหรือประหยัดข้อมูล
 * โหลดฉาก 3 มิติมาแทนหลังหน้าแสดงแล้ว ฉากหยุดเมื่อเลื่อนพ้นจอ และมีปุ่มหยุดเพราะขยับเองไม่มีจบ
 */
export function ParcelStage() {
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<ParcelScene | null>(null);
  const [live, setLive] = useState(false);
  const [inView, setInView] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    if (saveData || !matchMedia("(min-width: 900px) and (prefers-reduced-motion: no-preference)").matches) return;
    let cancelled = false;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    const timer = setTimeout(async () => {
      try {
        const { startParcelScene } = await import("./parcel-scene");
        if (cancelled || !canvas.current || !stage.current) return;
        scene.current = startParcelScene(canvas.current, sceneColors(stage.current));
        observer.observe(stage.current);
        setLive(true);
      } catch {
        // เครื่องที่วาด 3 มิติไม่ได้เห็นภาพ SVG ต่อไป
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      observer.disconnect();
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);

  useEffect(() => {
    scene.current?.setRunning(live && inView && !paused);
  }, [live, inView, paused]);

  return (
    <div ref={stage} className={styles.stage}>
      <div className={styles.stageArt} role="img" aria-label="พัสดุเดินทางจากร้านถึงบ้าน">
        <RouteArt travel="once" className={live ? styles.artHidden : ""} />
        <canvas ref={canvas} className={live ? styles.canvasLive : styles.canvas} />
      </div>
      {live && (
        <button type="button" className={styles.pause} aria-pressed={paused} onClick={() => setPaused(!paused)}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
            <path fill="currentColor" d={paused ? "M8 5v14l11-7L8 5Z" : "M7 5h4v14H7V5Zm6 0h4v14h-4V5Z"} />
          </svg>
          <span className="visually-hidden">หยุดภาพเคลื่อนไหว</span>
        </button>
      )}
    </div>
  );
}
