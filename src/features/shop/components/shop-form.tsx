"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Field, withTimeout, type Failed } from "@/features/account/components/action-form";
import type { ShopFormState } from "@/features/shop/actions";
import { PROVINCES } from "@/shared/provinces";
import { LOGO_MAX_BYTES, LOGO_TYPES, SHOP_ERRORS, SHOP_FORM_MESSAGES, type ShopErrors, type ShopInput } from "@/features/shop/server/rules";
import { LeaveGuard } from "./leave-guard";
import { ShopLogo } from "./shop-logo";
import styles from "./shop.module.css";

export type ShopFormMode = "open" | "settings";

/** ข้อความเหนือปุ่มบันทึกเมื่อบันทึกไม่ได้ทั้งฟอร์ม null เมื่อไม่มี (SHP-002 SHP-007 SHP-008 SHP-014 SHP-015) */
export function formMessage(mode: ShopFormMode, state: ShopFormState | Failed, sentLogo: boolean): string | null {
  if ("failed" in state) {
    if (sentLogo) return SHOP_FORM_MESSAGES.uploadFailed;
    return mode === "open" ? SHOP_FORM_MESSAGES.openFailed : SHOP_FORM_MESSAGES.saveFailed;
  }
  return state.notice ? SHOP_FORM_MESSAGES[state.notice] : null;
}

/** ตรวจรูปที่เพิ่งเลือกก่อนส่ง เซิร์ฟเวอร์ตรวจซ้ำจากไบต์ของไฟล์ (SHP-008) */
export function logoFileError(file: { type: string; size: number }): string | null {
  return (LOGO_TYPES as readonly string[]).includes(file.type) && file.size <= LOGO_MAX_BYTES ? null : SHOP_ERRORS.logo;
}

const noSubscribe = () => () => {};

type Props = {
  mode: ShopFormMode;
  action: (formData: FormData) => Promise<ShopFormState>;
  /** ค่าเดิมของร้านในหน้าตั้งค่าร้าน หน้าเปิดร้านไม่ส่ง ฟอร์มจึงว่าง */
  shop?: ShopInput & { id: number; logoUrl: string | null };
  /** ร้านถูกระงับ ทุกช่องอ่านได้อย่างเดียว (SHP-014) */
  readOnly?: boolean;
  cancelHref: string;
};

/** ฟอร์มของหน้าเปิดร้านและหน้าตั้งค่าร้าน ข้อมูลที่กรอกอยู่ครบเมื่อบันทึกไม่สำเร็จ */
export function ShopForm({ mode, action, shop, readOnly = false, cancelHref }: Props) {
  const [state, dispatch, pending] = useActionState<ShopFormState | Failed, FormData>(withTimeout(action), { errors: {} });
  // ก่อนหน้าโหลดเสร็จ กดแล้วเบราว์เซอร์จะส่งฟอร์มเองโดยไม่ผ่าน server action (SHP-013)
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(shop?.logoUrl ?? null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [sentLogo, setSentLogo] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // pending จะเป็น true หลัง React วาดใหม่ ส่วนนี้กันการกดซ้ำที่มาก่อนนั้น (SHP-005)
  const busy = useRef(false);

  useEffect(() => {
    if (!pending) busy.current = false;
  }, [pending]);

  useEffect(() => {
    if (!preview?.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  const errors: ShopErrors = "errors" in state ? state.errors : {};
  const message = formMessage(mode, state, sentLogo);
  const savedLogo = removeLogo ? null : (shop?.logoUrl ?? null);
  const name = shop?.name ?? "";

  return (
    <form
      method="post"
      encType="multipart/form-data"
      noValidate
      onInput={() => setDirty(true)}
      onSubmit={(event) => {
        // ไม่ใช้ prop action ของ form เพราะ React จะล้างทุกช่องหลังส่งเสร็จ
        event.preventDefault();
        if (busy.current || readOnly) return;
        busy.current = true;
        const formData = new FormData(event.currentTarget);
        const logo = formData.get("logo");
        setSentLogo(logo instanceof File && logo.size > 0);
        startTransition(() => dispatch(formData));
      }}
    >
      {shop && <input type="hidden" name="shopId" value={shop.id} />}
      <input type="hidden" name="removeLogo" value={removeLogo ? "1" : "0"} />
      <fieldset disabled={readOnly} className={styles.fieldset}>
        <Field label="ชื่อร้าน" name="name" defaultValue={shop?.name} autoComplete="organization" error={errors.name} />
        <div className="field">
          <label htmlFor="field-description">คำอธิบายร้าน (ไม่บังคับ)</label>
          <textarea
            id="field-description"
            name="description"
            className="input"
            rows={4}
            defaultValue={shop?.description}
            aria-invalid={errors.description ? true : undefined}
            aria-describedby={errors.description ? "field-description-error" : undefined}
          />
          {errors.description && (
            <p id="field-description-error" className="field-error">
              {errors.description}
            </p>
          )}
        </div>

        <div className="field">
          <label htmlFor="field-logo">โลโก้ร้าน (ไม่บังคับ) JPG หรือ PNG ไม่เกิน 2 MB</label>
          <div className={styles.logoPicker}>
            {(preview || name) && <ShopLogo name={name} logoUrl={preview} />}
            <input
              ref={fileInput}
              id="field-logo"
              name="logo"
              type="file"
              accept={LOGO_TYPES.join(",")}
              className="input"
              aria-invalid={logoError || errors.logo ? true : undefined}
              aria-describedby={logoError || errors.logo ? "field-logo-error" : undefined}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (!file) return;
                const error = logoFileError(file);
                setLogoError(error);
                if (error) {
                  // ไฟล์ที่ใช้ไม่ได้ไม่ถูกส่ง โลโก้เดิมยังแสดงอยู่
                  event.currentTarget.value = "";
                  setPreview(savedLogo);
                  return;
                }
                setRemoveLogo(false);
                setPreview(URL.createObjectURL(file));
              }}
            />
            {preview && (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  if (fileInput.current) fileInput.current.value = "";
                  setRemoveLogo(true);
                  setPreview(null);
                  setLogoError(null);
                  setDirty(true);
                }}
              >
                ลบโลโก้
              </button>
            )}
          </div>
          {(logoError ?? errors.logo) && (
            <p id="field-logo-error" className="field-error">
              {logoError ?? errors.logo}
            </p>
          )}
        </div>
      </fieldset>

      <fieldset disabled={readOnly} className={styles.fieldset}>
        <legend>ที่อยู่ต้นทาง</legend>
        <Field label="ชื่อผู้ส่ง" name="senderName" defaultValue={shop?.senderName} autoComplete="name" error={errors.senderName} />
        <Field
          label="เบอร์โทร"
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          placeholder="ตัวเลข 10 หลัก ขึ้นต้นด้วย 0"
          defaultValue={shop?.phone}
          error={errors.phone}
        />
        <Field label="รายละเอียดที่อยู่" name="address" defaultValue={shop?.address} autoComplete="street-address" error={errors.address} />
        <Field label="ตำบลหรือแขวง" name="subdistrict" defaultValue={shop?.subdistrict} error={errors.subdistrict} />
        <Field label="อำเภอหรือเขต" name="district" defaultValue={shop?.district} error={errors.district} />
        <div className="field">
          <label htmlFor="field-province">จังหวัด</label>
          <select
            id="field-province"
            name="province"
            className="input"
            defaultValue={shop?.province ?? ""}
            aria-invalid={errors.province ? true : undefined}
            aria-describedby={errors.province ? "field-province-error" : undefined}
          >
            <option value="">เลือกจังหวัด</option>
            {PROVINCES.map((province) => (
              <option key={province} value={province}>
                {province}
              </option>
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
          defaultValue={shop?.postcode}
          error={errors.postcode}
        />
      </fieldset>

      {message && (
        <div role="alert" className={styles.failed}>
          <p>{message}</p>
        </div>
      )}
      <div className={styles.actions}>
        {!readOnly && (
          <button type="submit" className="button" disabled={pending || !hydrated}>
            {pending ? "กำลังบันทึก" : mode === "open" ? "เปิดร้าน" : "บันทึก"}
          </button>
        )}
        <Link href={cancelHref} className="button button-secondary">
          {readOnly ? "กลับ" : "ยกเลิก"}
        </Link>
      </div>
      <LeaveGuard when={dirty && !readOnly} />
    </form>
  );
}
