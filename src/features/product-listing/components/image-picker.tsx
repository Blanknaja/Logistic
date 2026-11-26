"use client";

import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { LIMITS, MESSAGES } from "@/features/product-listing/server/product-rules";
import { moveItem, screenFiles, UPLOAD_TIMEOUT_MS, type ImageItem } from "./form-state";
import styles from "./product-listing.module.css";
import { uploadFile } from "./upload-file";

let nextId = 0;
const newId = () => `image-${++nextId}`;

/** รูปที่มีที่อยู่แล้ว เช่นรูปเดิมของสินค้าที่เปิดมาแก้ */
export const savedImage = (url: string): ImageItem => ({ id: newId(), preview: url, url, file: null, status: "done", progress: 100 });

/** เพิ่ม เรียง และลบรูปสินค้า รูปส่งขึ้นเซิร์ฟเวอร์ทันทีที่เลือก (PRD-003) */
export function ImagePicker({
  items,
  setItems,
  error,
}: {
  items: ImageItem[];
  setItems: Dispatch<SetStateAction<ImageItem[]>>;
  error?: string;
}) {
  const [rejected, setRejected] = useState<{ name: string; error: string }[]>([]);
  const dragFrom = useRef<number | null>(null);

  const update = (id: string, patch: Partial<ImageItem>) =>
    setItems((list) => list.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  const send = (id: string, file: File) => {
    update(id, { status: "uploading", progress: 0, error: undefined });
    uploadFile("/product-images", file, UPLOAD_TIMEOUT_MS, MESSAGES.uploadFailed, (progress) => update(id, { progress })).then(
      (url) => update(id, { status: "done", url, progress: 100 }),
      (failure: Error) => update(id, { status: "failed", error: failure.message }),
    );
  };

  const pick = (files: File[]) => {
    const result = screenFiles(items.length, files);
    setRejected(result.rejected);
    const added: ImageItem[] = result.accepted.map((file) => ({
      id: newId(),
      preview: URL.createObjectURL(file),
      url: null,
      file,
      status: "uploading",
      progress: 0,
    }));
    setItems((list) => [...list, ...added]);
    for (const item of added) send(item.id, item.file as File);
  };

  const remove = (item: ImageItem) => {
    if (item.preview.startsWith("blob:")) URL.revokeObjectURL(item.preview);
    setItems((list) => list.filter((other) => other.id !== item.id));
  };

  const move = (from: number, to: number) => setItems((list) => moveItem(list, from, to));
  const full = items.length >= LIMITS.images;

  return (
    <fieldset className={styles.section} aria-describedby={error ? "images-error" : undefined}>
      <legend>รูปสินค้า</legend>
      <p className={styles.hint}>JPG หรือ PNG ไม่เกิน 5 MB ต่อรูป รูปแรกเป็นรูปปก ลากหรือกดลูกศรเพื่อเรียงรูป</p>

      {items.length > 0 && (
        <ul className={styles.images}>
          {items.map((item, index) => (
            <li
              key={item.id}
              className={styles.image}
              draggable
              onDragStart={() => (dragFrom.current = index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (dragFrom.current !== null && dragFrom.current !== index) move(dragFrom.current, index);
                dragFrom.current = null;
              }}
            >
              <img src={item.preview} alt={`รูปที่ ${index + 1}`} />
              {index === 0 && <span className={styles.cover}>รูปปก</span>}
              {item.status === "uploading" && (
                <progress max={100} value={item.progress} aria-label={`กำลังส่งรูปที่ ${index + 1}`} />
              )}
              {item.status === "failed" && (
                <p role="alert" className="field-error">
                  {item.error ?? MESSAGES.uploadFailed}
                </p>
              )}
              <div className={styles.imageActions}>
                {item.status === "failed" && item.file && (
                  <button type="button" className="link-action" onClick={() => send(item.id, item.file as File)}>
                    ลองใหม่
                  </button>
                )}
                {index > 0 && (
                  <button
                    type="button"
                    className={`link-action ${styles.arrow}`}
                    aria-label={`เลื่อนรูปที่ ${index + 1} ไปก่อน`}
                    onClick={() => move(index, index - 1)}
                  >
                    ←
                  </button>
                )}
                {index < items.length - 1 && (
                  <button
                    type="button"
                    className={`link-action ${styles.arrow}`}
                    aria-label={`เลื่อนรูปที่ ${index + 1} ไปหลัง`}
                    onClick={() => move(index, index + 1)}
                  >
                    →
                  </button>
                )}
                <button
                  type="button"
                  className="link-action"
                  aria-label={`ลบรูปที่ ${index + 1}`}
                  onClick={() => remove(item)}
                >
                  ลบ
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.picker}>
        <label>
          <input
            type="file"
            accept="image/jpeg,image/png"
            multiple
            disabled={full}
            className={styles.fileInput}
            onChange={(event) => {
              pick(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
          <span className="button button-secondary">เพิ่มรูป</span>
        </label>
        <span aria-live="polite">
          {items.length}/{LIMITS.images}
        </span>
      </div>

      {rejected.length > 0 && (
        <ul role="alert" className={styles.hint}>
          {rejected.map((file, i) => (
            <li key={i} className="field-error">
              {file.name}: {file.error}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p id="images-error" className="field-error">
          {error}
        </p>
      )}
    </fieldset>
  );
}
