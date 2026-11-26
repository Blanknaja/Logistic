import Link from "next/link";
import type { CSSProperties } from "react";
import { changeMethodAction, checkStatusAction, payByPromptPayAction } from "@/features/payment/actions";
import { minutesLeftText, UNAVAILABLE_MESSAGE, type PaymentView, type PayPage } from "@/features/payment/server/payments";
import type { SimulatorMode } from "@/features/payment/server/simulator";
import { PAYMENT_WINDOW_MS } from "@/features/checkout/server/order-groups";
import { formatBaht, formatThaiDateTime } from "@/shared/format";
import { PAYMENT_METHOD } from "@/shared/statuses";
import { Celebrate } from "@/shared/ui/celebrate";
import { PurchaseSteps } from "@/shared/ui/journey";
import { StateArtIcon } from "@/shared/ui/states";
import { StatusBadge } from "@/shared/ui/status-badge";
import { CardForm } from "./card-form";
import { PayForm } from "./pay-form";
import { PaymentPoller } from "./payment-poller";
import styles from "./payment.module.css";
import { QrImage } from "./qr-image";
import { SimulatorPanel } from "./simulator-panel";

export type PayPageProps = {
  page: PayPage;
  method?: "card" | "promptpay";
  /** กด "จ่ายใหม่" มาจากหน้าจ่ายไม่สำเร็จ */
  retry?: boolean;
  notice?: "paid" | "pending";
  simulator?: { mode: SimulatorMode; canSwitchMode: boolean; waiting: PaymentView[] } | null;
};

/** เหลือเวลาจ่ายไม่เกินนี้ (นาที) บรรทัดเวลาที่เหลือเป็นสีเตือน ก่อนหน้านั้นเป็นสถานะปกติ */
export const DEADLINE_WARNING_MINUTES = 5;

const deadlineClass = (minutesLeft: number) =>
  minutesLeft <= DEADLINE_WARNING_MINUTES ? `badge ${styles.deadline} ${styles.deadlineSoon}` : `badge badge-wait ${styles.deadline}`;

/** วงแหวนเวลารอบ QR ยาวตามเวลาจ่ายที่เหลือ สั้นลงทุกครั้งที่หน้าถามผลใหม่ */
function TimeRing({ minutesLeft }: { minutesLeft: number }) {
  const left = Math.max(0, Math.min(1, (minutesLeft * 60_000) / PAYMENT_WINDOW_MS));
  return (
    <svg className={minutesLeft <= DEADLINE_WARNING_MINUTES ? `${styles.ring} ${styles.ringSoon}` : styles.ring} aria-hidden="true">
      <rect className={styles.ringTrack} x="3" y="3" rx="18" pathLength="1" />
      <rect className={styles.ringLeft} x="3" y="3" rx="18" pathLength="1" strokeDasharray={`${left} 1`} />
    </svg>
  );
}

/** "ด้วยบัตรลงท้าย 4242" หรือ "ด้วย PromptPay" คำไทยติดกันได้ คำอังกฤษต้องเว้นวรรค */
const paidWith = (payment: PaymentView) =>
  payment.method === PAYMENT_METHOD.card ? `ด้วยบัตรลงท้าย ${payment.cardLast4 ?? ""}` : `ด้วย ${payment.method}`;

/** ยอดของแต่ละร้านพับไว้ ร้านเดียวยอดของร้านคือยอดที่ต้องจ่าย จึงบอกแค่ชื่อร้าน */
function Orders({ page }: { page: PayPage }) {
  if (page.orders.length === 1) return <p className={styles.muted}>ร้าน {page.orders[0].shopName}</p>;
  return (
    <details className={styles.orders}>
      <summary>ยอดแยกตามร้าน {page.orders.length} ร้าน</summary>
      <ul className={styles.plainList}>
        {page.orders.map((order) => (
          <li key={order.orderNo} className={styles.line}>
            <span>ร้าน {order.shopName}</span>
            <span>{formatBaht(order.total)}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function ChooseMethod({ page, method }: { page: PayPage; method: "card" | "promptpay" }) {
  const choice = (value: "card" | "promptpay", label: string) => (
    <Link href={`/pay/${page.groupId}?method=${value}`} className="chip" aria-current={method === value ? "true" : undefined}>
      {label}
    </Link>
  );
  return (
    <>
      <h1>จ่ายเงิน</h1>
      <p className={deadlineClass(page.minutesLeft)}>{minutesLeftText(page.minutesLeft)}</p>
      <Orders page={page} />
      <section className={`card card-pad ${styles.section}`}>
        <h2>เลือกวิธีจ่าย</h2>
        <div className={styles.methods}>
          {choice("card", "บัตร")}
          {choice("promptpay", "PromptPay")}
        </div>
        {method === "card" ? (
          <CardForm groupId={page.groupId} amount={page.amount} failedMessage={UNAVAILABLE_MESSAGE} />
        ) : (
          <>
            <p className={styles.hint}>กดจ่ายเงินแล้วสแกน QR ด้วยแอปธนาคาร</p>
            <PayForm
              action={payByPromptPayAction}
              groupId={page.groupId}
              label="จ่ายเงิน"
              pendingLabel="กำลังจ่ายเงิน"
              failedMessage={UNAVAILABLE_MESSAGE}
              amount={page.amount}
            />
          </>
        )}
      </section>
    </>
  );
}

function Waiting({ page, pending, notice, simulated }: { page: PayPage; pending: PaymentView; notice?: string; simulated: boolean }) {
  const promptPay = pending.method === PAYMENT_METHOD.promptPay;
  return (
    <>
      <h1>รอผลการจ่ายเงิน</h1>
      {notice === "pending" && (
        <p role="status" className="notice notice-wait">
          มีการจ่ายเงินที่กำลังรอผลอยู่
        </p>
      )}
      {promptPay && (
        <div className={`card ${styles.qrFrame}`}>
          <TimeRing minutesLeft={page.minutesLeft} />
          <QrImage src={pending.qrImageUrl} amount={pending.amount} />
        </div>
      )}
      <p className={styles.total}>
        ยอด {formatBaht(pending.amount)} ด้วย {pending.method}
      </p>
      <p className={deadlineClass(page.minutesLeft)}>
        กำลังรอผลการจ่ายเงิน {minutesLeftText(page.minutesLeft)}
        <span className="dots" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <i key={i} style={{ "--i": i } as CSSProperties} />
          ))}
        </span>
      </p>
      {promptPay && (
        <p className={styles.hint}>
          ในโหมดทดลอง ระบบรู้ผลเมื่อมีคนกดทำเครื่องหมายในหน้าจัดการของ Omise{simulated && " หรือที่ตัวจำลองด้านล่าง"}
        </p>
      )}
      <div className={styles.quietActions}>
        <PayForm
          action={checkStatusAction}
          groupId={page.groupId}
          label="เช็คสถานะการจ่ายเงิน"
          pendingLabel="กำลังเช็คสถานะ"
          failedMessage="เช็คสถานะไม่ได้ตอนนี้ กรุณาลองใหม่"
          quiet
        />
        <details className={styles.confirm}>
          <summary className="link-action">เปลี่ยนวิธีจ่าย</summary>
          <form action={changeMethodAction}>
            <input type="hidden" name="groupId" value={page.groupId} />
            <p>{promptPay ? "เลิกใช้ QR นี้ใช่ไหม" : "เลิกรอการจ่ายเงินนี้ใช่ไหม"}</p>
            <button type="submit" className="button">
              ยืนยัน
            </button>
          </form>
        </details>
      </div>
    </>
  );
}

function Failed({ page }: { page: PayPage }) {
  return (
    <>
      <StateArtIcon art="alert" />
      <h1>จ่ายเงินไม่สำเร็จ</h1>
      <p role="alert" className={`notice notice-alert ${styles.reason}`}>
        {page.lastFailed?.failureReason ?? "จ่ายเงินไม่สำเร็จ"}
      </p>
      <p className={deadlineClass(page.minutesLeft)}>{minutesLeftText(page.minutesLeft)}</p>
      <div className={`${styles.submit} ${styles.payBar}`}>
        <p className={styles.due}>ยอดที่ต้องจ่าย {formatBaht(page.amount)}</p>
        <Link href={`/pay/${page.groupId}?retry=1`} className="button">
          จ่ายใหม่
        </Link>
      </div>
    </>
  );
}

function Paid({ page, notice }: { page: PayPage; notice?: string }) {
  const paid = page.succeeded;
  return (
    <div className={`card ${styles.paid}`}>
      <Celebrate onceKey={`paid:${page.groupId}`} />
      <h1>จ่ายเงินสำเร็จ</h1>
      {notice === "paid" && (
        <p role="status" className="notice">
          คำสั่งซื้อนี้จ่ายเงินแล้ว
        </p>
      )}
      {paid && (
        <p className={styles.result}>
          จ่ายแล้ว {formatBaht(paid.amount)} {paidWith(paid)} เวลา {formatThaiDateTime(paid.resolvedAt ?? paid.startedAt)}
        </p>
      )}
      <ul className={styles.plainList}>
        {page.orders.map((order) => (
          <li key={order.orderNo} className={styles.line}>
            <Link href={`/orders/${order.orderNo}`}>
              คำสั่งซื้อ {order.orderNo} ร้าน {order.shopName}
            </Link>
            <span className={styles.muted}>
              {page.orders.length > 1 && `${formatBaht(order.total)} `}
              <StatusBadge status={order.status} />
            </span>
          </li>
        ))}
      </ul>
      <Link href="/orders" className="button">
        ดูคำสั่งซื้อของฉัน
      </Link>
    </div>
  );
}

function Closed({ page }: { page: PayPage }) {
  return (
    <>
      <StateArtIcon art="box" />
      <h1>คำสั่งซื้อถูกยกเลิกแล้ว จ่ายเงินไม่ได้</h1>
      {page.closedByDeadline && <p className={styles.closed}>หมดเวลาจ่ายเงิน คำสั่งซื้อถูกยกเลิก</p>}
      <Link href="/orders" className="button">
        ไปหน้าคำสั่งซื้อของฉัน
      </Link>
    </>
  );
}

/** หน้าจ่ายเงิน หน้ารอผล หน้าจ่ายสำเร็จ และหน้าจ่ายไม่สำเร็จ ของกลุ่มคำสั่งซื้อหนึ่งกลุ่ม */
export function PayPageView({ page, method, retry = false, notice, simulator }: PayPageProps) {
  const view = page.view === "failed" && (retry || method) ? "open" : page.view;
  return (
    <div className={styles.page}>
      <p className={styles.testMode}>
        โหมดทดลอง ไม่มีการตัดเงินจริง{simulator && " · กำลังใช้ตัวจำลองการจ่ายเงิน"}
      </p>
      {view !== "closed" && <PurchaseSteps current={view === "paid" ? 3 : 2} />}
      {/* ยังไม่เลือกวิธี เปิดแบบกรอกบัตรไว้ก่อน ผู้ซื้อจึงเห็นช่องที่ต้องกรอกตั้งแต่จอแรก */}
      {view === "open" && <ChooseMethod page={page} method={method ?? "card"} />}
      {view === "pending" && page.pending && <Waiting page={page} pending={page.pending} notice={notice} simulated={!!simulator} />}
      {view === "failed" && <Failed page={page} />}
      {view === "paid" && <Paid page={page} notice={notice} />}
      {view === "closed" && <Closed page={page} />}
      {page.unused.length > 0 && (
        <section className={`notice notice-alert ${styles.unused}`}>
          <p>ได้รับเงินทดลองหลังคำสั่งซื้อปิดไปแล้ว เงินจำนวนนี้ไม่ถูกใช้</p>
          <ul className={styles.plainList}>
            {page.unused.map((payment) => (
              <li key={payment.id}>
                {payment.method} {formatBaht(payment.amount)} {payment.status}
              </li>
            ))}
          </ul>
        </section>
      )}
      {page.history.length > 0 && (
        <details className={styles.history}>
          <summary>ประวัติการจ่ายเงิน ({page.history.length} ครั้ง)</summary>
          <ul className={styles.plainList}>
            {page.history.map((payment) => (
              <li key={payment.id} className={styles.line}>
                <span>
                  {formatThaiDateTime(payment.startedAt)} {payment.method} {formatBaht(payment.amount)}
                </span>
                <StatusBadge status={payment.status} />
              </li>
            ))}
          </ul>
        </details>
      )}
      {page.poll && <PaymentPoller groupId={page.groupId} />}
      {simulator && <SimulatorPanel groupId={page.groupId} {...simulator} />}
    </div>
  );
}
