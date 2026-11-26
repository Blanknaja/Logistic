import { PARCEL_STATUS, type ParcelStatus } from "@/shared/statuses";
import { PROVINCE_POINTS } from "./province-points/points";

export type RoutePoint = { province: string; lat: number; lng: number };

/** เส้นทางของพัสดุระดับจังหวัด ข้อความเส้นทางและแผนที่การจัดส่งใช้ค่าเดียวกันนี้ (MAP-004 ถึง MAP-009) */
export type DeliveryRoute = {
  /** จังหวัดที่พัสดุผ่านมาแล้วเรียงตามเวลา ไม่ซ้ำจังหวัดที่ติดกัน ลากเส้นทึบตามลำดับนี้ */
  passed: RoutePoint[];
  /** จังหวัดล่าสุด หมุดที่ถูกเน้น */
  latest: RoutePoint;
  destination: RoutePoint;
  /** หมุดหนึ่งตัวต่อจังหวัด */
  pins: RoutePoint[];
  /** เส้นประจากจังหวัดล่าสุดไปปลายทาง */
  dashed: boolean;
};

const known = (province: string | null): province is keyof typeof PROVINCE_POINTS =>
  province !== null && Object.hasOwn(PROVINCE_POINTS, province);

const point = (province: keyof typeof PROVINCE_POINTS): RoutePoint => {
  const [lat, lng] = PROVINCE_POINTS[province];
  return { province, lat, lng };
};

/**
 * origin คือจังหวัดของที่อยู่ต้นทางของพัสดุ history คือจังหวัดของประวัติการจัดส่งจากเก่าไปใหม่
 * รายการที่ไม่มีจังหวัด (null) หรือจังหวัดไม่อยู่ในรายชื่อจังหวัดถูกข้าม (MAP-007)
 * ได้ null เมื่อไม่มีจังหวัดที่ผ่านมาแล้วเหลือเลย หรือจังหวัดปลายทางไม่อยู่ในรายชื่อจังหวัด
 */
export function deliveryRoute(input: {
  origin: string;
  history: (string | null)[];
  destination: string;
  status: ParcelStatus;
}): DeliveryRoute | null {
  const provinces = [input.origin, ...input.history].filter(known);
  if (provinces.length === 0 || !known(input.destination)) return null;
  const passed = provinces.filter((province, i) => province !== provinces[i - 1]).map(point);
  const latest = passed[passed.length - 1];
  const destination = point(input.destination);
  const pins = [...passed, destination].filter((pin, i, all) => all.findIndex((other) => other.province === pin.province) === i);
  const finished = input.status === PARCEL_STATUS.delivered || input.status === PARCEL_STATUS.failed;
  return { passed, latest, destination, pins, dashed: !finished && latest.province !== destination.province };
}

/** ข้อความเส้นทางที่อ่านได้โดยไม่ต้องเห็นแผนที่ (MAP-006) */
export function routeText(route: DeliveryRoute): string {
  const destination = route.destination.province;
  if (route.pins.length === 1) return `จัดส่งภายใน${destination}`;
  const before = route.passed.slice(0, -1).map((stop) => `${stop.province} → `).join("");
  const latest = route.latest.province;
  if (latest === destination) return `${before}${latest} (ล่าสุด และปลายทาง)`;
  return route.dashed
    ? `${before}${latest} (ล่าสุด) → ${destination} (ปลายทาง)`
    : `${before}${latest} (ล่าสุด) · ปลายทาง ${destination}`;
}
