"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { withTimeout } from "@/shared/ui/timeout";
import { saveStockAction, saveStockFormAction } from "@/features/stock/actions";
import { INVALID_STOCK_MESSAGE, stockLabel, STOCK_LABEL } from "@/features/stock/server/labels";
import type { SaveStockResult, StockRow } from "@/features/stock/server/stock";
import { formatNumber } from "@/shared/format";
import styles from "./stock.module.css";

export type Outcome = SaveStockResult["outcome"] | "failed";

type RowState = { stock: number; reserved: number; outcome: Outcome | null };

const FEEDBACK: Partial<Record<Outcome, { text: string; role: "status" | "alert" }>> = {
  saved: { text: "บันทึกแล้ว", role: "status" },
  changed: { text: "สต็อกเปลี่ยนไปแล้ว ตรวจจำนวนล่าสุดแล้วบันทึกใหม่", role: "alert" },
  failed: { text: "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง", role: "alert" },
  "not-found": { text: "ไม่พบหน้านี้", role: "alert" },
};

/** ข้อความหลังกดบันทึก ส่วนจำนวนที่กรอกผิดแสดงใต้ช่องกรอกแทน */
export function SaveFeedback({ outcome }: { outcome: Outcome | null }) {
  const feedback = outcome ? FEEDBACK[outcome] : undefined;
  if (!feedback) return null;
  return (
    <p role={feedback.role} className={feedback.role === "alert" ? styles.alert : styles.saved}>
      {feedback.text}
    </p>
  );
}

export function StockBadge({ stock }: { stock: number }) {
  const label = stockLabel(stock);
  if (!label) return null;
  return <span className={label === STOCK_LABEL.out ? styles.badgeOut : styles.badgeLow}>{label}</span>;
}

const timedSave = withTimeout(saveStockAction);

async function submit(previous: RowState, formData: FormData): Promise<RowState> {
  const result = await timedSave({ failed: true }, formData);
  return "failed" in result ? { ...previous, outcome: "failed" } : { ...previous, ...result };
}

/**
 * หนึ่งแถวของหน้าสต็อก ตัวเลขสต็อกอยู่ในช่องกรอกที่เดียว ปุ่มบันทึกและยกเลิกขึ้นเมื่อแก้ตัวเลขแล้ว
 * ตัวเลขที่แสดงมาจากผลบันทึกล่าสุดของแถวนี้ จึงใช้เทียบได้ว่าสต็อกเปลี่ยนไปหรือยัง (INV-006)
 * back คือที่อยู่หน้าสต็อกที่เปิดอยู่ เบราว์เซอร์ที่ไม่มี JavaScript บันทึกแล้วกลับไปที่นั่น
 * outcome คือผลที่ได้กลับมาจากทางที่ไม่มี JavaScript
 */
export function StockRowItem({ row, back = "/seller/stock", outcome: initialOutcome = null }: { row: StockRow; back?: string; outcome?: Outcome | null }) {
  const [state, dispatch, pending] = useActionState(submit, { stock: row.stock, reserved: row.reserved, outcome: initialOutcome });
  const [value, setValue] = useState(String(row.stock));
  const [cancelled, setCancelled] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // pending จะเป็น true หลัง React วาดใหม่ ส่วนนี้กันการกดซ้ำที่มาก่อนนั้น
  const busy = useRef(false);
  const refocus = useRef(false);

  useEffect(() => {
    if (!pending) busy.current = false;
  }, [pending]);

  const outcome = cancelled ? null : state.outcome;
  const dirty = value !== String(state.stock);

  // ปุ่มที่กดหายไปเมื่อบันทึกสำเร็จ จึงพาโฟกัสกลับไปที่ช่องกรอก
  useEffect(() => {
    if (refocus.current && !pending && !dirty) input.current?.focus();
    refocus.current = false;
  }, [state, pending, dirty]);

  const inputId = `stock-${row.variantId}`;
  const errorId = `${inputId}-error`;

  return (
    <li className={styles.row} data-dirty={dirty || pending || undefined}>
      <p className={styles.name}>
        {row.productName}
        {row.variantLabel && <span className={styles.variant}> {row.variantLabel}</span>}
      </p>
      <p className={styles.meta}>
        <StockBadge stock={state.stock} />
        <span className={styles.reserved}>
          <span className={styles.cellLabel}>จองอยู่ </span>
          {formatNumber(state.reserved)}
        </span>
        <Link href={`/seller/stock/${row.variantId}`} className={`link-action ${styles.historyLink}`}>
          ประวัติสต็อก
        </Link>
      </p>
      <form
        action={saveStockFormAction}
        noValidate
        className={styles.form}
        onSubmit={(event) => {
          // ไม่ใช้ action ของ form ตอนมี JavaScript เพราะ React จะล้างช่องที่กรอกหลังส่งเสร็จ
          event.preventDefault();
          if (busy.current) return;
          busy.current = true;
          refocus.current = true;
          setCancelled(false);
          const formData = new FormData(event.currentTarget);
          startTransition(() => dispatch(formData));
        }}
      >
        <input type="hidden" name="variantId" value={row.variantId} />
        <input type="hidden" name="expected" value={state.stock} />
        <input type="hidden" name="back" value={back} />
        <span className={styles.field}>
          <label htmlFor={inputId} className="visually-hidden">
            {`สต็อก ${row.productName} ${row.variantLabel}`.trim()}
          </label>
          <input
            ref={input}
            id={inputId}
            name="stock"
            className={`input ${styles.input}`}
            inputMode="numeric"
            autoComplete="off"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-invalid={outcome === "invalid" ? true : undefined}
            aria-describedby={outcome === "invalid" ? errorId : undefined}
          />
        </span>
        <span className={styles.controls}>
          <button type="submit" className="button button-secondary" disabled={pending}>
            {pending ? "กำลังบันทึก..." : "บันทึก"}
          </button>
          <button
            type="button"
            className="button button-secondary"
            disabled={pending}
            onClick={() => {
              setValue(String(state.stock));
              setCancelled(true);
              input.current?.focus();
            }}
          >
            ยกเลิก
          </button>
        </span>
        {(outcome === "invalid" || (outcome && FEEDBACK[outcome])) && (
          <div className={styles.messages}>
            {outcome === "invalid" && (
              <p id={errorId} className="field-error">
                {INVALID_STOCK_MESSAGE}
              </p>
            )}
            <SaveFeedback outcome={outcome} />
          </div>
        )}
      </form>
    </li>
  );
}
