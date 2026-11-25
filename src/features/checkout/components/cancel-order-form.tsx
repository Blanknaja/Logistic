"use client";

import Link from "next/link";
import { ActionForm } from "@/shared/ui/action-form";
import { cancelOrderAction } from "@/features/checkout/buyer-order-actions";

/** ขั้นยืนยันการยกเลิก บอกว่าจะยกเลิกกี่คำสั่งซื้อจากร้านไหนบ้าง (CHK-011) */
export function CancelOrderForm({ orderNo, message }: { orderNo: string; message: string }) {
  return (
    <ActionForm
      action={cancelOrderAction}
      initialState={{ error: null }}
      label="ยืนยันยกเลิก"
      pendingLabel="กำลังยกเลิก..."
      secondary={
        <Link href={`/orders/${orderNo}`} className="button button-secondary">
          ไม่ยกเลิก
        </Link>
      }
    >
      {(state) => (
        <>
          <input type="hidden" name="orderNo" value={orderNo} />
          <p>{message}</p>
          {"error" in state && state.error && (
            <p role="alert" className="field-error">
              {state.error}
            </p>
          )}
        </>
      )}
    </ActionForm>
  );
}
