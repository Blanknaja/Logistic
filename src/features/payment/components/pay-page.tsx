import Link from "next/link";
import { changeMethodAction, checkStatusAction, payByPromptPayAction } from "@/features/payment/actions";
import { minutesLeftText, UNAVAILABLE_MESSAGE, type PaymentView, type PayPage } from "@/features/payment/server/payments";
import type { SimulatorMode } from "@/features/payment/server/simulator";
import { formatBaht, formatDateTime } from "@/shared/format";
import { PAYMENT_METHOD } from "@/shared/statuses";
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
  simulator?: { mode: SimulatorMode; waiting: PaymentView[] } | null;
};

const paidWith = (payment: PaymentView) =>
  payment.method === PAYMENT_METHOD.card ? `บัตรลงท้าย ${payment.cardLast4 ?? ""}` : payment.method;

function Summary({ page }: { page: PayPage }) {
  return (
    <section className={`card ${styles.section}`}>
      <p className={styles.total}>ยอดที่ต้องจ่าย {formatBaht(page.amount)}</p>
      <ul className={styles.plainList}>
        {page.orders.map((order) => (
          <li key={order.orderNo} className={styles.line}>
            <span>ร้าน {order.shopName}</span>
            <span>{formatBaht(order.total)}</span>
          </li>
        ))}
      </ul>
      <p className={styles.deadline}>{minutesLeftText(page.minutesLeft)}</p>
    </section>
  );
}

function ChooseMethod({ page, method }: { page: PayPage; method?: "card" | "promptpay" }) {
  const choice = (value: "card" | "promptpay", label: string) => (
    <Link
      href={`/pay/${page.groupId}?method=${value}`}
      className={method === value ? "button" : "button button-secondary"}
      aria-current={method === value ? "true" : undefined}
    >
      {label}
    </Link>
  );
  return (
    <>
      <h1>จ่ายเงิน</h1>
      <Summary page={page} />
      <h2>เลือกวิธีจ่าย</h2>
      <div className={styles.row}>
        {choice("card", "บัตร")}
        {choice("promptpay", "PromptPay")}
      </div>
      {method === "card" && (
        <section className={`card ${styles.section}`}>
          <CardForm groupId={page.groupId} failedMessage={UNAVAILABLE_MESSAGE} />
        </section>
      )}
      {method === "promptpay" && (
        <section className={`card ${styles.section}`}>
          <p>กดจ่ายเงินแล้วสแกน QR ด้วยแอปธนาคาร</p>
          <PayForm
            action={payByPromptPayAction}
            groupId={page.groupId}
            label="จ่ายเงิน"
            pendingLabel="กำลังจ่ายเงิน"
            failedMessage={UNAVAILABLE_MESSAGE}
          />
        </section>
      )}
    </>
  );
}

function Waiting({ page, pending, notice, simulated }: { page: PayPage; pending: PaymentView; notice?: string; simulated: boolean }) {
  const promptPay = pending.method === PAYMENT_METHOD.promptPay;
  return (
    <>
      <h1>รอผลการจ่ายเงิน</h1>
      {notice === "pending" && (
        <p role="status" className={styles.notice}>
          มีการจ่ายเงินที่กำลังรอผลอยู่
        </p>
      )}
      <Summary page={page} />
      <section className={`card ${styles.section}`}>
        {promptPay && <QrImage src={pending.qrImageUrl} amount={pending.amount} />}
        <p className={styles.total}>
          ยอด {formatBaht(pending.amount)} ด้วย {pending.method}
        </p>
        <p>กำลังรอผลการจ่ายเงิน เหลือเวลา {page.minutesLeft} นาที</p>
        {promptPay && (
          <p className={styles.hint}>
            ในโหมดทดลอง ต้องมีคนกดทำเครื่องหมายว่าสำเร็จหรือไม่สำเร็จในหน้าจัดการของ Omise ระบบจึงจะรู้ผล
            {simulated && " ตอนนี้ใช้ตัวจำลอง กดทำเครื่องหมายได้ที่ส่วนตัวจำลองด้านล่าง"}
          </p>
        )}
        <PayForm
          action={checkStatusAction}
          groupId={page.groupId}
          label="เช็คสถานะการจ่ายเงิน"
          pendingLabel="กำลังเช็คสถานะ"
          failedMessage="เช็คสถานะไม่ได้ตอนนี้ กรุณาลองใหม่"
          secondary
        />
        <details className={styles.confirm}>
          <summary className="button button-secondary">เปลี่ยนวิธีจ่าย</summary>
          <form action={changeMethodAction}>
            <input type="hidden" name="groupId" value={page.groupId} />
            <p>{promptPay ? "เลิกใช้ QR นี้ใช่ไหม" : "เลิกรอการจ่ายเงินนี้ใช่ไหม"}</p>
            <button type="submit" className="button">
              ยืนยัน
            </button>
          </form>
        </details>
      </section>
    </>
  );
}

function Failed({ page }: { page: PayPage }) {
  return (
    <>
      <h1>จ่ายเงินไม่สำเร็จ</h1>
      <p role="alert" className={styles.alert}>
        {page.lastFailed?.failureReason ?? "จ่ายเงินไม่สำเร็จ"}
      </p>
      <Summary page={page} />
      <Link href={`/pay/${page.groupId}?retry=1`} className="button">
        จ่ายใหม่
      </Link>
    </>
  );
}

function Paid({ page, notice }: { page: PayPage; notice?: string }) {
  const paid = page.succeeded;
  return (
    <>
      <h1>จ่ายเงินสำเร็จ</h1>
      {notice === "paid" && (
        <p role="status" className={styles.notice}>
          คำสั่งซื้อนี้จ่ายเงินแล้ว
        </p>
      )}
      <section className={`card ${styles.section}`}>
        {paid && (
          <p className={styles.total}>
            จ่ายแล้ว {formatBaht(paid.amount)} ด้วย{paidWith(paid)} เวลา {formatDateTime(paid.resolvedAt ?? paid.startedAt)}
          </p>
        )}
        <p>ไม่มียอดที่ต้องจ่าย</p>
        <ul className={styles.plainList}>
          {page.orders.map((order) => (
            <li key={order.orderNo} className={styles.line}>
              <Link href={`/orders/${order.orderNo}`}>
                คำสั่งซื้อ {order.orderNo} ร้าน {order.shopName}
              </Link>
              <span>
                {formatBaht(order.total)} {order.status}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <Link href="/orders" className="button">
        ดูคำสั่งซื้อของฉัน
      </Link>
    </>
  );
}

function Closed({ page }: { page: PayPage }) {
  return (
    <>
      <h1>คำสั่งซื้อถูกยกเลิกแล้ว จ่ายเงินไม่ได้</h1>
      {page.closedByDeadline && <p>หมดเวลาจ่ายเงิน คำสั่งซื้อถูกยกเลิก</p>}
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
      <p className={styles.testMode}>โหมดทดลอง ไม่มีการตัดเงินจริง</p>
      {simulator && <p className={styles.simulatorNote}>กำลังใช้ตัวจำลองการจ่ายเงิน ยังไม่ได้ต่อ Omise จริง</p>}
      {view === "open" && <ChooseMethod page={page} method={method} />}
      {view === "pending" && page.pending && <Waiting page={page} pending={page.pending} notice={notice} simulated={!!simulator} />}
      {view === "failed" && <Failed page={page} />}
      {view === "paid" && <Paid page={page} notice={notice} />}
      {view === "closed" && <Closed page={page} />}
      {page.unused.length > 0 && (
        <section className={styles.alert}>
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
        <details className={styles.section}>
          <summary>ประวัติการจ่ายเงิน ({page.history.length} ครั้ง)</summary>
          <ul className={styles.plainList}>
            {page.history.map((payment) => (
              <li key={payment.id} className={styles.line}>
                <span>
                  {formatDateTime(payment.startedAt)} {payment.method} {formatBaht(payment.amount)}
                </span>
                <span>{payment.status}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {page.poll && <PaymentPoller groupId={page.groupId} />}
      {simulator && <SimulatorPanel groupId={page.groupId} mode={simulator.mode} waiting={simulator.waiting} />}
    </div>
  );
}
