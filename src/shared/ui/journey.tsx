import Link from "next/link";
import type { CSSProperties } from "react";
import { ORDER_STATUS, PARCEL_STATUS } from "@/shared/statuses";

/** ลำดับสถานะของคำสั่งซื้อที่ไปได้ดี */
export const ORDER_JOURNEY: string[] = [ORDER_STATUS.awaitingPayment, ORDER_STATUS.paid, ORDER_STATUS.shipping, ORDER_STATUS.completed];

/** ลำดับสถานะของพัสดุที่ไปได้ดี */
export const PARCEL_JOURNEY: string[] = [
  PARCEL_STATUS.awaitingPacking,
  PARCEL_STATUS.handedOver,
  PARCEL_STATUS.inTransit,
  PARCEL_STATUS.outForDelivery,
  PARCEL_STATUS.delivered,
];

/**
 * เส้นทางเป็นจุด current คือลำดับของขั้นล่าสุด (เริ่มที่ 0) ขั้นก่อนหน้าเป็นสีเขียว
 * compact ซ่อนชื่อขั้น ทั้งแถบเป็นรูปเดียวที่มี label และวางในลิงก์ได้ stopped คือเส้นทางที่หยุดกลางทาง เช่นส่งไม่สำเร็จ
 */
export function Journey({
  steps,
  current,
  label,
  compact = false,
  stopped = false,
}: {
  steps: string[];
  current: number;
  label: string;
  compact?: boolean;
  stopped?: boolean;
}) {
  // ขั้นสุดท้ายที่ถึงแล้วคือจบเส้นทาง จึงเป็นสีเขียวเหมือนขั้นที่ผ่าน
  const finished = !stopped && current === steps.length - 1;
  const List = compact ? "span" : "ol";
  const Step = compact ? "span" : "li";
  return (
    <List
      className={compact ? "journey journey-compact" : "journey"}
      aria-label={label}
      data-stopped={stopped ? "" : undefined}
      role={compact ? "img" : undefined}
    >
      {steps.map((step, index) => (
        <Step
          key={step}
          data-done={index < current || (finished && index === current) ? "" : undefined}
          aria-current={index === current && !finished ? "step" : undefined}
          style={{ "--i": index } as CSSProperties}
        >
          <span className="journey-dot" aria-hidden="true" />
          {!compact && <span>{step}</span>}
        </Step>
      ))}
    </List>
  );
}

const PURCHASE_STEPS = ["ตะกร้า", "ที่อยู่และยอด", "จ่ายเงิน"];

/** แถบบอกขั้นของเส้นทางซื้อ current เริ่มที่ 0 ส่ง 3 เมื่อจ่ายเงินสำเร็จแล้ว */
export function PurchaseSteps({ current }: { current: 0 | 1 | 2 | 3 }) {
  return (
    <ol className="steps" aria-label="ขั้นของการสั่งซื้อ">
      {PURCHASE_STEPS.map((step, index) => (
        <li key={step} data-done={index < current ? "" : undefined} aria-current={index === current ? "step" : undefined}>
          <span className="steps-dot" aria-hidden="true">
            {index < current ? "✓" : index + 1}
          </span>
          <span className="steps-label">
            {/* ย้อนไปตะกร้าได้จนกว่าจะสั่งซื้อ หลังจากนั้นตะกร้าไม่ใช่ของคำสั่งซื้อนี้แล้ว */}
            {index === 0 && current === 1 ? (
              <Link href="/cart" transitionTypes={["nav-back"]}>
                {step}
              </Link>
            ) : (
              step
            )}
            {index < current && <span className="visually-hidden"> (ผ่านแล้ว)</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
