import { markSimulatorChargeAction, setSimulatorModeAction } from "@/features/payment/actions";
import type { PaymentView } from "@/features/payment/server/payments";
import type { SimulatorMode } from "@/features/payment/server/simulator";
import { formatBaht } from "@/shared/format";
import styles from "./payment.module.css";

const MODES: { mode: SimulatorMode; label: string }[] = [
  { mode: "normal", label: "Omise ตอบปกติ" },
  { mode: "no-answer", label: "Omise ไม่ตอบเกิน 10 วินาที" },
  { mode: "unavailable", label: "Omise ให้บริการไม่ได้" },
];

/** ส่วนควบคุมตัวจำลอง ใช้แทนหน้าจัดการของ Omise ตอนลองเส้นทางต่างๆ ในเครื่อง */
export function SimulatorPanel({ groupId, mode, waiting }: { groupId: number; mode: SimulatorMode; waiting: PaymentView[] }) {
  return (
    <section className={styles.simulatorPanel} aria-label="ตัวจำลองการจ่ายเงิน">
      <h2>ตัวจำลองการจ่ายเงิน</h2>
      <p>ใช้แทน Omise เพราะยังไม่ได้ใส่กุญแจทดลองของ Omise ไม่มีการต่อ Omise จริง</p>
      <ul className={styles.plainList}>
        <li>บัตรจ่ายสำเร็จ: 4242 4242 4242 4242</li>
        <li>บัตรวงเงินไม่พอ: 4111 1111 1114 0011</li>
        <li>บัตรถูกปฏิเสธ: 4111 1111 1111 0014</li>
      </ul>
      <form action={setSimulatorModeAction} className={styles.row}>
        <input type="hidden" name="groupId" value={groupId} />
        {MODES.map((option) => (
          <button
            key={option.mode}
            type="submit"
            name="mode"
            value={option.mode}
            className={option.mode === mode ? "button" : "button button-secondary"}
            aria-pressed={option.mode === mode}
          >
            {option.label}
          </button>
        ))}
      </form>
      {waiting.map((payment) => (
        <form key={payment.id} action={markSimulatorChargeAction} className={styles.row}>
          <input type="hidden" name="groupId" value={groupId} />
          <input type="hidden" name="chargeId" value={payment.chargeId ?? ""} />
          <span>
            {payment.method} {formatBaht(payment.amount)} ({payment.status})
          </span>
          <button type="submit" name="result" value="successful" className="button button-secondary">
            ทำเครื่องหมายว่าสำเร็จ
          </button>
          <button type="submit" name="result" value="failed" className="button button-secondary">
            ทำเครื่องหมายว่าไม่สำเร็จ
          </button>
        </form>
      ))}
    </section>
  );
}
