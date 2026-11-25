"use client";

import Link from "next/link";
import { ActionForm, Field } from "@/shared/ui/action-form";
import { saveAddressAction } from "@/features/checkout/address-actions";
import type { ShippingAddress } from "@/features/checkout/server/addresses";
import { PROVINCES } from "@/shared/provinces";
import styles from "./addresses.module.css";

/** CHK-002 แบบกรอกที่อยู่ใหม่ หรือแก้ที่อยู่เดิมเมื่อส่ง address มา หลังบันทึกกลับไปที่ next ถ้ามี */
export function AddressForm({ address, next }: { address?: ShippingAddress; next: string | null }) {
  return (
    <ActionForm
      action={saveAddressAction}
      initialState={{ errors: {} }}
      label="บันทึก"
      pendingLabel="กำลังบันทึก..."
      secondary={
        <Link href={next ?? "/addresses"} className="button button-secondary">
          ยกเลิก
        </Link>
      }
    >
      {(state) => {
        const errors = "errors" in state ? state.errors : {};
        return (
          <>
            {errors.form && (
              <p role="alert" className="field-error">
                {errors.form}
              </p>
            )}
            <input type="hidden" name="addressId" value={address?.id ?? ""} />
            {next && <input type="hidden" name="next" value={next} />}
            <Field
              label="ชื่อผู้รับ"
              name="recipientName"
              defaultValue={address?.recipientName}
              autoComplete="name"
              error={errors.recipientName}
            />
            <Field
              label="เบอร์โทร"
              name="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="เช่น 0812345678"
              className={`input ${styles.phone}`}
              defaultValue={address?.phone}
              error={errors.phone}
            />
            <Field
              label="บ้านเลขที่ ซอย ถนน"
              name="address"
              autoComplete="street-address"
              defaultValue={address?.address}
              error={errors.address}
            />
            <Field label="ตำบลหรือแขวง" name="subdistrict" defaultValue={address?.subdistrict} error={errors.subdistrict} />
            <Field label="อำเภอหรือเขต" name="district" defaultValue={address?.district} error={errors.district} />
            <div className="field">
              <label htmlFor="field-province">จังหวัด</label>
              <select
                id="field-province"
                name="province"
                className={`input ${styles.province}`}
                defaultValue={address?.province ?? ""}
                aria-invalid={errors.province ? true : undefined}
                aria-describedby={errors.province ? "field-province-error" : undefined}
              >
                <option value="" disabled>
                  เลือกจังหวัด
                </option>
                {PROVINCES.map((province) => (
                  <option key={province}>{province}</option>
                ))}
              </select>
              {errors.province && (
                <p id="field-province-error" className="field-error">
                  {errors.province}
                </p>
              )}
            </div>
            <Field
              label="รหัสไปรษณีย์"
              name="postcode"
              inputMode="numeric"
              autoComplete="postal-code"
              placeholder="เช่น 50200"
              className={`input ${styles.postcode}`}
              defaultValue={address?.postcode}
              error={errors.postcode}
            />
          </>
        );
      }}
    </ActionForm>
  );
}
