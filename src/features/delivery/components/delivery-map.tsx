"use client";

import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap } from "leaflet";
import { useEffect, useRef, useState } from "react";
import type { DeliveryRoute, RoutePoint } from "@/features/delivery/server/route";
import { ErrorState } from "@/shared/ui/states";
import styles from "./delivery-map.module.css";

/** ภาพแผนที่โหลดไม่เสร็จภายในเท่านี้ถือว่าแสดงไม่ได้ (MAP-005) */
export const MAP_TIMEOUT_MS = 10_000;

const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const at = (point: RoutePoint): [number, number] => [point.lat, point.lng];

/**
 * แผนที่การจัดส่ง (MAP-004) วาดหมุดและเส้นจาก route เดียวกับข้อความเส้นทาง
 * ภาพแผนที่โหลดไม่สำเร็จหรือเกิน 10 วินาที แสดงข้อความกับปุ่ม "ลองใหม่" ในที่ของแผนที่ (MAP-005)
 */
export function DeliveryMap({ route }: { route: DeliveryRoute }) {
  const canvas = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    let map: LeafletMap | undefined;
    let finished = false;
    const finish = (next: "ready" | "failed") => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      setState(next);
    };
    const timer = setTimeout(() => finish("failed"), MAP_TIMEOUT_MS);

    // Leaflet อ่าน window ตอนโหลด จึงโหลดได้เฉพาะในเบราว์เซอร์ และขอภาพแผนที่หลังหน้าแสดงแล้วเท่านั้น
    import("leaflet")
      .then(({ default: L }) => {
        if (finished) return;
        map = L.map(element, {
          zoomControl: false,
          scrollWheelZoom: false,
          // บนมือถือ นิ้วเดียวเลื่อนหน้าผ่านแผนที่ได้ (MAP-Q03) ซูมด้วยสองนิ้วหรือปุ่ม
          dragging: !L.Browser.mobile,
        });
        L.control.zoom({ zoomInTitle: "ซูมเข้า", zoomOutTitle: "ซูมออก" }).addTo(map);
        if (route.passed.length > 1) {
          L.polyline(route.passed.map(at), { className: styles.solid, interactive: false }).addTo(map);
        }
        if (route.dashed) {
          L.polyline([at(route.latest), at(route.destination)], { className: styles.dashed, interactive: false }).addTo(map);
        }
        for (const pin of route.pins) {
          const latest = pin.province === route.latest.province;
          L.circleMarker(at(pin), { radius: latest ? 10 : 7, className: latest ? styles.latest : styles.pin, interactive: false })
            .bindTooltip(pin.province, {
              permanent: true,
              direction: "right",
              offset: [12, 0],
              className: latest ? `${styles.label} ${styles.labelLatest}` : styles.label,
            })
            .addTo(map);
        }
        const bounds = L.latLngBounds(route.pins.map(at));
        const fit = () => {
          // แผนที่ที่ซ่อนอยู่ตอนแสดงไม่ได้มีขนาด 0 คิดระดับซูมไม่ได้
          if (map && map.getSize().x > 0) map.fitBounds(bounds, { padding: [48, 48], maxZoom: 8, animate: false });
        };
        fit();
        // หมุนจอหรือย่อหน้าต่าง หมุดยังอยู่ในกรอบครบ
        map.on("resize", fit);
        // ส่งไปแค่ชื่อเว็บ ไม่ส่งที่อยู่หน้าที่มีเลขติดตามพัสดุให้ OpenStreetMap
        L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19, referrerPolicy: "origin" })
          .on("load", () => finish("ready"))
          .on("tileerror", () => finish("failed"))
          .addTo(map);
      })
      .catch(() => finish("failed"));

    return () => {
      finished = true;
      clearTimeout(timer);
      map?.remove();
    };
  }, [attempt, route]);

  const retry = () => {
    setState("loading");
    setAttempt((n) => n + 1);
  };

  return (
    <div className={styles.map} data-delivery-map={state}>
      <div ref={canvas} className={styles.canvas} hidden={state === "failed"} />
      {state === "failed" && (
        <ErrorState
          title="แสดงแผนที่ไม่ได้ ลองใหม่อีกครั้ง"
          action={
            <button type="button" className="button button-secondary" onClick={retry}>
              ลองใหม่
            </button>
          }
        />
      )}
    </div>
  );
}
