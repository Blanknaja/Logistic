"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import type { Category } from "@/features/product-listing/server/categories";
import type { ListedStatus } from "@/features/product-listing/server/products";
import {
  EMPTY_PRODUCT,
  LIMITS,
  MESSAGES,
  type ProductErrors,
  type ProductValues,
  type SaveIntent,
} from "@/features/product-listing/server/product-rules";
import { PRODUCT_STATUS } from "@/shared/statuses";
import { settle, type Failed } from "@/shared/ui/timeout";
import { canSaveImages, canSaveModel, isDirty, normalizeValues } from "./form-state";
import { ImagePicker, savedImage } from "./image-picker";
import { LeaveDialog } from "./leave-dialog";
import { ModelPicker, savedModel } from "./model-picker";
import { OptionEditor, type EditableOption } from "./option-editor";
import styles from "./product-listing.module.css";

/** conflict คือข้อความเมื่อสินค้าถูกแก้จากที่อื่นหลังเปิดหน้าฟอร์ม (PRD-013) */
export type SaveResult = { errors: ProductErrors; conflict?: string };
type Payload = { intent: SaveIntent; values: ProductValues };

const LIST_PATH = "/seller/products";

function ErrorText({ id, text }: { id: string; text?: string }) {
  return text ? (
    <p id={id} className="field-error">
      {text}
    </p>
  ) : null;
}

/** บันทึกจากข้อมูลเก่าไม่ได้ ต้องโหลดข้อมูลล่าสุดก่อน การแก้ในฟอร์มนี้จะหาย (PRD-013) */
export function ConflictAlert({ message, onReload }: { message: string; onReload: () => void }) {
  return (
    <div role="alert" className={styles.alert}>
      <p>{message}</p>
      <button type="button" className="button button-secondary" onClick={onReload}>
        โหลดข้อมูลล่าสุด
      </button>
    </div>
  );
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
 * status คือสถานะของสินค้าที่เปิดมาแก้ สินค้าที่ ขายอยู่ หรือ ซ่อน มีปุ่ม "บันทึก" ปุ่มเดียว (PRD-007)
 * modelFile คือชื่อและขนาดของไฟล์ 3 มิติใน initial.model (P3D-001)
 */
export function ProductForm({
  categories,
  initial = EMPTY_PRODUCT,
  status,
  modelFile = null,
  save,
}: {
  categories: Category[];
  initial?: ProductValues;
  status?: ListedStatus;
  modelFile?: { name: string; size: number } | null;
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
  const [model, setModel] = useState(() => (initial.model && modelFile ? savedModel(initial.model, modelFile) : null));
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const [intent, setIntent] = useState<SaveIntent | null>(null);

  const values = normalizeValues({
    name,
    description,
    categoryId,
    images: images.flatMap((image) => (image.url ? [image.url] : [])),
    options: options.map((option) => ({ name: option.name, values: option.values })),
    prices,
    model: model?.url ?? null,
  });
  const imagesReady = canSaveImages(images);
  const filesReady = imagesReady && canSaveModel(model);
  useLeaveGuard(isDirty(saved, values, images) || !canSaveModel(model), setLeaveTo);

  const [state, dispatch, pending] = useActionState<SaveResult | Failed, Payload>(
    (_previous, payload) => settle(save(payload.intent, payload.values)),
    { errors: {} },
  );
  // pending เป็น true หลัง React วาดใหม่ ส่วนนี้กันการกดซ้ำที่มาก่อนนั้น
  const busy = useRef(false);
  useEffect(() => {
    if (!pending) busy.current = false;
  }, [pending]);

  const submit = (next: SaveIntent) => {
    if (busy.current || !filesReady) return;
    busy.current = true;
    setIntent(next);
    startTransition(() => dispatch({ intent: next, values }));
  };

  const errors = "errors" in state ? state.errors : {};
  const conflict = "conflict" in state ? state.conflict : undefined;
  const listed = status === PRODUCT_STATUS.onSale || status === PRODUCT_STATUS.hidden;
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
      <ModelPicker model={model} setModel={setModel} error={errors.model} />
      <OptionEditor options={options} setOptions={setOptions} prices={prices} setPrices={setPrices} errors={errors} />

      {"failed" in state && (
        <p role="alert" className={styles.alert}>
          {MESSAGES.saveFailed}
        </p>
      )}
      {conflict && <ConflictAlert message={conflict} onReload={() => router.refresh()} />}
      {Object.keys(errors).length > 0 && (
        <p role="alert" className={styles.alert}>
          ยังบันทึกไม่ได้ ดูข้อความใต้ช่องที่ผิด
        </p>
      )}
      {!imagesReady && <p className={styles.hint}>รอรูปส่งเสร็จ หรือลบรูปที่ส่งไม่สำเร็จ ก่อนบันทึก</p>}

      <div className={styles.saveBar}>
        {listed ? (
          // แก้สินค้าที่ลงขายแล้วต้องข้อมูลครบเหมือนเปิดขาย และสถานะคงเดิม
          <button type="button" className="button" disabled={pending || !filesReady} onClick={() => submit("publish")}>
            {label("publish", "บันทึก")}
          </button>
        ) : (
          <>
            <button type="button" className="button button-secondary" disabled={pending || !filesReady} onClick={() => submit("draft")}>
              {label("draft", "บันทึกร่าง")}
            </button>
            <button type="button" className="button" disabled={pending || !filesReady} onClick={() => submit("publish")}>
              {label("publish", "บันทึกและเปิดขาย")}
            </button>
          </>
        )}
        <Link href={LIST_PATH} className="button button-secondary">
          กลับไปรายการสินค้า
        </Link>
      </div>

      {leaveTo && <LeaveDialog onStay={() => setLeaveTo(null)} onLeave={() => router.push(leaveTo)} />}
    </form>
  );
}
