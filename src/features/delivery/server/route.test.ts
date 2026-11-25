import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { PROVINCES } from "@/shared/provinces";
import { PARCEL_STATUS, type ParcelStatus } from "@/shared/statuses";
import { PROVINCE_POINTS } from "./province-points/points";
import { deliveryRoute, routeText, type DeliveryRoute } from "./route";

const S = PARCEL_STATUS;
const names = (points: { province: string }[]) => points.map((point) => point.province);
/** ส่วนที่แผนที่ใช้วาด: หมุด จังหวัดล่าสุดที่ถูกเน้น เส้นทึบ และเส้นประ */
const drawn = (route: DeliveryRoute) => ({
  pins: names(route.pins),
  latest: route.latest.province,
  solid: names(route.passed),
  dashed: route.dashed,
});

describe("MAP-004 MAP-006 เส้นทางของพัสดุที่ยังไม่จบการจัดส่ง", () => {
  test("MAP-004 MAP-006 หมุด 3 จังหวัด เส้นทึบเชียงใหม่ถึงลำปาง เส้นประลำปางถึงกรุงเทพมหานคร เน้นลำปาง และข้อความเส้นทาง", () => {
    const route = deliveryRoute({
      origin: "เชียงใหม่",
      history: ["เชียงใหม่", "เชียงใหม่", "ลำปาง"],
      destination: "กรุงเทพมหานคร",
      status: S.inTransit,
    });

    expect(drawn(route)).toEqual({
      pins: ["เชียงใหม่", "ลำปาง", "กรุงเทพมหานคร"],
      latest: "ลำปาง",
      solid: ["เชียงใหม่", "ลำปาง"],
      dashed: true,
    });
    expect(route.pins[0]).toEqual({ province: "เชียงใหม่", lat: PROVINCE_POINTS.เชียงใหม่[0], lng: PROVINCE_POINTS.เชียงใหม่[1] });
    expect(route.destination.province).toBe("กรุงเทพมหานคร");
    expect(routeText(route)).toBe("เชียงใหม่ → ลำปาง (ล่าสุด) → กรุงเทพมหานคร (ปลายทาง)");
  });
});

describe("MAP-007 ประวัติการจัดส่งที่ไม่มีจังหวัด", () => {
  test("MAP-007 ข้ามรายการที่ไม่มีจังหวัด และเริ่มจากจังหวัดของที่อยู่ต้นทาง", () => {
    const route = deliveryRoute({
      origin: "เชียงใหม่",
      history: [null, null, "ลำปาง"],
      destination: "กรุงเทพมหานคร",
      status: S.inTransit,
    });

    expect(names(route.pins)).toEqual(["เชียงใหม่", "ลำปาง", "กรุงเทพมหานคร"]);
    expect(routeText(route)).toBe("เชียงใหม่ → ลำปาง (ล่าสุด) → กรุงเทพมหานคร (ปลายทาง)");
  });

  test("MAP-007 ไม่มีรายการไหนมีจังหวัด หมุดต้นทางถูกเน้นเป็นจังหวัดล่าสุด", () => {
    const route = deliveryRoute({ origin: "เชียงใหม่", history: [null, null], destination: "กรุงเทพมหานคร", status: S.handedOver });

    expect(drawn(route)).toEqual({
      pins: ["เชียงใหม่", "กรุงเทพมหานคร"],
      latest: "เชียงใหม่",
      solid: ["เชียงใหม่"],
      dashed: true,
    });
    expect(routeText(route)).toBe("เชียงใหม่ (ล่าสุด) → กรุงเทพมหานคร (ปลายทาง)");
  });
});

describe("MAP-008 ต้นทางและปลายทางอยู่จังหวัดเดียวกัน", () => {
  test("MAP-008 ทุกจุดอยู่กรุงเทพมหานคร หมุดเดียว ไม่มีเส้น และบอกว่าจัดส่งภายในจังหวัด", () => {
    const route = deliveryRoute({
      origin: "กรุงเทพมหานคร",
      history: ["กรุงเทพมหานคร", "กรุงเทพมหานคร", "กรุงเทพมหานคร"],
      destination: "กรุงเทพมหานคร",
      status: S.outForDelivery,
    });

    expect(drawn(route)).toEqual({ pins: ["กรุงเทพมหานคร"], latest: "กรุงเทพมหานคร", solid: ["กรุงเทพมหานคร"], dashed: false });
    expect(routeText(route)).toBe("จัดส่งภายในกรุงเทพมหานคร");
  });

  test("MAP-008 ออกไปนนทบุรีแล้วกลับมากรุงเทพมหานคร หมุด 2 จังหวัด เส้นทึบไปและกลับ", () => {
    const route = deliveryRoute({
      origin: "กรุงเทพมหานคร",
      history: ["กรุงเทพมหานคร", "นนทบุรี", "กรุงเทพมหานคร"],
      destination: "กรุงเทพมหานคร",
      status: S.outForDelivery,
    });

    expect(drawn(route)).toEqual({
      pins: ["กรุงเทพมหานคร", "นนทบุรี"],
      latest: "กรุงเทพมหานคร",
      solid: ["กรุงเทพมหานคร", "นนทบุรี", "กรุงเทพมหานคร"],
      dashed: false,
    });
    expect(routeText(route)).toBe("กรุงเทพมหานคร → นนทบุรี → กรุงเทพมหานคร (ล่าสุด และปลายทาง)");
  });
});

describe("MAP-009 แผนที่เมื่อการจัดส่งจบแล้ว", () => {
  test("MAP-009 ส่งสำเร็จ เส้นทึบจากเชียงใหม่ผ่านลำปางถึงกรุงเทพมหานคร ไม่มีเส้นประ", () => {
    const route = deliveryRoute({
      origin: "เชียงใหม่",
      history: ["เชียงใหม่", "เชียงใหม่", "ลำปาง", "กรุงเทพมหานคร", "กรุงเทพมหานคร"],
      destination: "กรุงเทพมหานคร",
      status: S.delivered,
    });

    expect(drawn(route)).toEqual({
      pins: ["เชียงใหม่", "ลำปาง", "กรุงเทพมหานคร"],
      latest: "กรุงเทพมหานคร",
      solid: ["เชียงใหม่", "ลำปาง", "กรุงเทพมหานคร"],
      dashed: false,
    });
    expect(routeText(route)).toBe("เชียงใหม่ → ลำปาง → กรุงเทพมหานคร (ล่าสุด และปลายทาง)");
  });

  test("MAP-009 ส่งไม่สำเร็จที่ลำปาง มีหมุดปลายทางแต่ไม่มีเส้นประ", () => {
    const route = deliveryRoute({
      origin: "เชียงใหม่",
      history: ["เชียงใหม่", "เชียงใหม่", "ลำปาง", "ลำปาง", "ลำปาง"],
      destination: "กรุงเทพมหานคร",
      status: S.failed,
    });

    expect(drawn(route)).toEqual({
      pins: ["เชียงใหม่", "ลำปาง", "กรุงเทพมหานคร"],
      latest: "ลำปาง",
      solid: ["เชียงใหม่", "ลำปาง"],
      dashed: false,
    });
    expect(routeText(route)).toBe("เชียงใหม่ → ลำปาง (ล่าสุด) · ปลายทาง กรุงเทพมหานคร");
  });
});

describe("MAP-Q04 อ่านได้โดยไม่ต้องเห็นแผนที่", () => {
  test("MAP-Q04 ทุกสถานะและทุกแบบเส้นทาง ข้อความเส้นทางมีชื่อจังหวัดครบทุกหมุด", () => {
    const provinces = ["เชียงใหม่", "ลำปาง", "กรุงเทพมหานคร", "นนทบุรี"];
    const histories: (string | null)[][] = [[null], ["ลำปาง"], [null, "นนทบุรี", "ลำปาง"], ["กรุงเทพมหานคร", "นนทบุรี", "เชียงใหม่", "ลำปาง"]];
    let checked = 0;
    for (const status of Object.values(S) as ParcelStatus[]) {
      for (const origin of provinces) {
        for (const destination of provinces) {
          for (const history of histories) {
            const route = deliveryRoute({ origin, history, destination, status });
            const text = routeText(route);
            for (const pin of route.pins) expect(text, `${origin} ${history} ${destination} ${status}`).toContain(pin.province);
            checked++;
          }
        }
      }
    }
    expect(checked).toBe(6 * 4 * 4 * 4);
  });
});

describe("ตำแหน่งบนแผนที่ของแต่ละจังหวัด (delivery-map.md ส่วนที่ 5)", () => {
  test("ทุกจังหวัดในรายชื่อจังหวัดมีหนึ่งจุด และทุกจุดอยู่ในกรอบของประเทศไทย", () => {
    expect(Object.keys(PROVINCE_POINTS).sort()).toEqual([...PROVINCES].sort());
    for (const province of PROVINCES) {
      const [lat, lng] = PROVINCE_POINTS[province];
      expect(lat, province).toBeGreaterThanOrEqual(5.6);
      expect(lat, province).toBeLessThanOrEqual(20.5);
      expect(lng, province).toBeGreaterThanOrEqual(97.3);
      expect(lng, province).toBeLessThanOrEqual(105.7);
    }
  });

  test("ที่มาและสัญญาอนุญาตของตำแหน่งอยู่ใน SOURCES.txt ข้างไฟล์ และทุกจังหวัดมีรหัสที่มา", () => {
    const sources = readFileSync(new URL("./province-points/SOURCES.txt", import.meta.url), "utf8");
    expect(sources).toContain("CC0");
    for (const province of PROVINCES) expect(sources).toMatch(new RegExp(`^  ${province} Q\\d+$`, "m"));
  });
});
