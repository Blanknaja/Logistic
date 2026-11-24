"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import type { Category } from "@/features/product-listing/server/categories";
import {
  EMPTY_PRODUCT,
  LIMITS,
  MESSAGES,
  type ProductErrors,
  type ProductValues,
  type SaveIntent,
} from "@/features/product-listing/server/product-rules";
import { canSaveImages, isDirty, normalizeValues, raceSave, type SaveFailed } from "./form-state";
import { ImagePicker, savedImage } from "./image-picker";
import { LeaveDialog } from "./leave-dialog";
import { OptionEditor, type EditableOption } from "./option-editor";
import styles from "./product-listing.module.css";

type SaveResult = { errors: ProductErrors };
type Payload = { intent: SaveIntent; values: ProductValues };

const LIST_PATH = "/seller/products";

function ErrorText({ id, text }: { id: string; text?: string }) {
  return text ? (
    <p id={id} className="field-error">
      {text}
    </p>
  ) : null;
}

const describedBy = (id: string, error?: string) => ({
  "aria-invalid": error ? true : undefined,
  "aria-describedby": error ? `${id}-error` : undefined,
});

/** ถามก่อนออกเมื่อมีการแก้ที่ยังไม่บันทึก ทั้งกดลิงก์ในหน้าและปิดหรือโหลดหน้าใหม่ (PRD-014) */
function useLeaveGuard(dirty: boolean, ask: (path: string) => void) {
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    // ฟังที่ window ช่วงจับ จึงทำงานก่อน Link ซึ่งจะไม่พาไปเมื่อ event ถูก preventDefault แล้ว
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href);
      if (url.origin !== window.location.origin) return;
      event.preventDefault();
      ask(url.pathname + url.search + url.hash);
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("click", click, true);
    };
  }, [dirty, ask]);
}

/**
 * หน้าฟอร์มสินค้า ใช้ได้ทั้งสร้างใหม่และแก้ไข: ส่ง initial เป็นข้อมูลที่บันทึกไว้ และ save เป็น server action
 * save ที่สำเร็จต้อง redirect ไปหน้าอื่น ถ้าไม่ผ่านให้คืนข้อความผิดของแต่ละช่อง
 */
export function ProductForm({
  categories,
  initial = EMPTY_PRODUCT,
  save,
}: {
  categories: Category[];
  initial?: ProductValues;
  save: (intent: SaveIntent, values: ProductValues) => Promise<SaveResult>;
}) {
  const router = useRouter();
  const saved = useMemo(() => normalizeValues(initial), [initial]);
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const [images, setImages] = useState(() => initial.images.map(savedImage));
  const [options, setOptions] = useState<EditableOption[]>(() => initial.options.map((option, i) => ({ ...option, id: i + 1 })));
  const [prices, setPrices] = useState(initial.prices);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const [intent, setIntent] = useState<SaveIntent | null>(null);

  const values = normalizeValues({
    name,
    description,
    categoryId,
    images: images.flatMap((image) => (image.url ? [image.url] : [])),
    options: options.map((option) => ({ name: option.name, values: option.values })),
    prices,
  });
  const imagesReady = canSaveImages(images);
  useLeaveGuard(isDirty(saved, values, images), setLeaveTo);

  const [state, dispatch, pending] = useActionState<SaveResult | SaveFailed, Payload>(
    (_previous, payload) => raceSave(save(payload.intent, payload.values)),
    { errors: {} },
  );
  // pending เป็น true หลัง React วาดใหม่ ส่วนนี้กันการกดซ้ำที่มาก่อนนั้น
  const busy = useRef(false);
  useEffect(() => {
    if (!pending) busy.current = false;
  }, [pending]);

  const submit = (next: SaveIntent) => {
    if (busy.current || !imagesReady) return;
    busy.current = true;
    setIntent(next);
    startTransition(() => dispatch({ intent: next, values }));
  };

  const errors = "errors" in state ? state.errors : {};
  const label = (forIntent: SaveIntent, text: string) => (pending && intent === forIntent ? "กำลังบันทึก..." : text);

  return (
    <form className={styles.form} noValidate onSubmit={(event) => event.preventDefault()}>
      <div className={styles.section}>
        <div className="field">
          <label htmlFor="product-name">ชื่อสินค้า</label>
          <input
            id="product-name"
            className="input"
            maxLength={LIMITS.name}
            value={name}
            onChange={(event) => setName(event.target.value)}
            {...describedBy("product-name", errors.name)}
          />
          <ErrorText id="product-name-error" text={errors.name} />
        </div>

        <div className="field">
          <label htmlFor="product-description">รายละเอียด</label>
          <textarea
            id="product-description"
            className={`input ${styles.textarea}`}
            maxLength={LIMITS.description}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            {...describedBy("product-description", errors.description)}
          />
          <ErrorText id="product-description-error" text={errors.description} />
        </div>

        <div className="field">
          <label htmlFor="product-category">หมวดหมู่</label>
          <select
            id="product-category"
            className="input"
            value={categoryId ?? ""}
            onChange={(event) => setCategoryId(event.target.value ? Number(event.target.value) : null)}
            {...describedBy("product-category", errors.categoryId)}
          >
            <option value="">เลือกหมวดหมู่</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <ErrorText id="product-category-error" text={errors.categoryId} />
        </div>
      </div>

      <ImagePicker items={images} setItems={setImages} error={errors.images} />
      <OptionEditor options={options} setOptions={setOptions} prices={prices} setPrices={setPrices} errors={errors} />

      {"failed" in state && (
        <p role="alert" className={styles.alert}>
          {MESSAGES.saveFailed}
        </p>
      )}
      {Object.keys(errors).length > 0 && (
        <p role="alert" className={styles.alert}>
          ยังบันทึกไม่ได้ ดูข้อความใต้ช่องที่ผิด
        </p>
      )}
      {!imagesReady && <p className={styles.hint}>รอรูปส่งเสร็จ หรือลบรูปที่ส่งไม่สำเร็จ ก่อนบันทึก</p>}

      <div className={styles.actions}>
        <button type="button" className="button button-secondary" disabled={pending || !imagesReady} onClick={() => submit("draft")}>
          {label("draft", "บันทึกร่าง")}
        </button>
        <button type="button" className="button" disabled={pending || !imagesReady} onClick={() => submit("publish")}>
          {label("publish", "บันทึกและเปิดขาย")}
        </button>
        <Link href={LIST_PATH} className="button button-secondary">
          กลับไปรายการสินค้า
        </Link>
      </div>

      {leaveTo && <LeaveDialog onStay={() => setLeaveTo(null)} onLeave={() => router.push(leaveTo)} />}
    </form>
  );
}
