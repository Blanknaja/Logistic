"use client";

import { Field } from "@/features/account/components/action-form";
import { payByCardAction } from "@/features/payment/actions";
import { PayForm } from "./pay-form";
import styles from "./payment.module.css";

/** แบบกรอกบัตร เริ่มว่างทุกครั้ง ระบบไม่จำข้อมูลบัตร (PAY-011) */
export function CardForm({ groupId, failedMessage }: { groupId: number; failedMessage: string }) {
  return (
    <PayForm action={payByCardAction} groupId={groupId} label="จ่ายเงิน" pendingLabel="กำลังจ่ายเงิน" failedMessage={failedMessage}>
      {({ errors = {} }) => (
        <>
          <Field label="เลขบัตร" name="number" inputMode="numeric" autoComplete="cc-number" error={errors.number} />
          <p className={styles.fieldHint}>ใช้เลขบัตรทดลองของ Omise เท่านั้น</p>
          <Field label="ชื่อบนบัตร" name="name" autoComplete="cc-name" error={errors.name} />
          <Field label="เดือนปีหมดอายุ" name="expiry" placeholder="MM/YY" autoComplete="cc-exp" error={errors.expiry} />
          <Field label="รหัสหลังบัตร" name="securityCode" inputMode="numeric" autoComplete="cc-csc" error={errors.securityCode} />
        </>
      )}
    </PayForm>
  );
}
