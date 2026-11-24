"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef } from "react";
import { Field, SubmitButton, withTimeout, type Failed } from "@/features/account/components/action-form";
import type { StatusChangeProblem } from "@/features/delivery/server/parcel-status";
import { changeParcelStatusAction } from "@/features/delivery/status-actions";
import { PARCEL_STATUS, type ParcelStatus } from "@/shared/statuses";
import styles from "./status-change.module.css";

export const SAVE_FAILED = "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง";

/** ฟอร์มเปลี่ยนสถานะหนึ่งขั้น ข้อมูลที่กรอกอยู่ครบเมื่อบันทึกไม่ได้ ระหว่างรอผลกดซ้ำไม่ได้ (DLV-014) */
export function StatusChangeForm({ trackingNo, from, to }: { trackingNo: string; from: ParcelStatus; to: ParcelStatus }) {
  const [state, dispatch, pending] = useActionState<StatusChangeProblem | Failed, FormData>(
    withTimeout(changeParcelStatusAction),
    {},
  );
  const form = useRef<HTMLFormElement>(null);
  // pending จะเป็น true หลัง React วาดใหม่ ส่วนนี้กันการกดซ้ำที่มาก่อนนั้น
  const busy = useRef(false);
  useEffect(() => {
    if (!pending) busy.current = false;
  }, [pending]);

  const problem = "failed" in state ? {} : state;
  const errors = problem.fieldErrors ?? {};

  return (
    <form
      ref={form}
      method="post"
      noValidate
      className="card"
      onSubmit={(event) => {
        // ไม่ใช้ prop action ของ form เพราะ React จะล้างทุกช่องหลังส่งเสร็จ
        event.preventDefault();
        if (busy.current) return;
        busy.current = true;
        const formData = new FormData(event.currentTarget);
        startTransition(() => dispatch(formData));
      }}
    >
      <h2 className={styles.formTitle}>เปลี่ยนเป็น {to}</h2>
      <input type="hidden" name="trackingNo" value={trackingNo} />
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="to" value={to} />
      <Field label="สถานที่" name="location" maxLength={100} error={errors.location} />
      {to === PARCEL_STATUS.delivered && (
        <Field label="ชื่อผู้รับ" name="receiverName" maxLength={100} error={errors.receiverName} />
      )}
      {to === PARCEL_STATUS.failed && (
        <Field label="เหตุผลที่ส่งไม่สำเร็จ" name="reason" maxLength={200} error={errors.reason} />
      )}
      {problem.error && (
        <div role="alert" className={styles.problem}>
          <p>{problem.error}</p>
          {problem.currentStatus && <p>สถานะปัจจุบัน: {problem.currentStatus}</p>}
        </div>
      )}
      {"failed" in state && (
        <div role="alert" className={styles.problem}>
          <p>{SAVE_FAILED}</p>
          <button
            type="button"
            className="button button-secondary"
            disabled={pending}
            onClick={() => form.current?.requestSubmit()}
          >
            ลองใหม่
          </button>
        </div>
      )}
      <div className={styles.actions}>
        <SubmitButton pending={pending} label="บันทึก" pendingLabel="กำลังบันทึก" />
        <Link href={`/parcels/${encodeURIComponent(trackingNo)}`} className="button button-secondary">
          ยกเลิก
        </Link>
      </div>
    </form>
  );
}
