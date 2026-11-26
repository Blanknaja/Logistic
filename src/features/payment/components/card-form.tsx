"use client";

import { Field } from "@/shared/ui/action-form";
import { payByCardAction } from "@/features/payment/actions";
import { PayForm } from "./pay-form";
import styles from "./payment.module.css";

/** แบบกรอกบัตร เริ่มว่างทุกครั้ง ระบบไม่จำข้อมูลบัตร (PAY-011) ช่องกว้างตามจำนวนตัวที่กรอก */
export function CardForm({ groupId, amount, failedMessage }: { groupId: number; amount: number; failedMessage: string }) {
  return (
    <PayForm
      action={payByCardAction}
      groupId={groupId}
      label="จ่ายเงิน"
      pendingLabel="กำลังจ่ายเงิน"
      failedMessage={failedMessage}
      amount={amount}
    >
      {({ errors = {} }) => (
        <>
          <Field
            label="เลขบัตร"
            name="number"
            inputMode="numeric"
            autoComplete="cc-number"
            className={`input ${styles.cardNumber}`}
            error={errors.number}
          />
          <p className={styles.fieldHint}>ใช้เลขบัตรทดลองของ Omise เท่านั้น</p>
          <Field label="ชื่อบนบัตร" name="name" autoComplete="cc-name" error={errors.name} />
          <div className={styles.pair}>
            <Field
              label="เดือนปีหมดอายุ"
              name="expiry"
              placeholder="MM/YY"
              autoComplete="cc-exp"
              className={`input ${styles.short}`}
              error={errors.expiry}
            />
            <Field
              label="รหัสหลังบัตร"
              name="securityCode"
              inputMode="numeric"
              autoComplete="cc-csc"
              className={`input ${styles.short}`}
              error={errors.securityCode}
            />
          </div>
        </>
      )}
    </PayForm>
  );
}
