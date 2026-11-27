"use client";

import Link from "next/link";
import { useState } from "react";
import { UPLOAD_TIMEOUT_MS, type ImageItem } from "@/features/product-listing/components/form-state";
import { uploadFile } from "@/features/product-listing/components/upload-file";
import type { ReviewFormState } from "@/features/review/actions";
import { LIMITS, MESSAGES, screenReviewFiles, textLength } from "@/features/review/rules";
import styles from "./review.module.css";
import { SaveForm, useSave, type SaveAction } from "./save-form";

let nextId = 0;
const newId = () => `review-image-${++nextId}`;

const savedImage = (url: string): ImageItem => ({ id: newId(), preview: url, url, file: null, status: "done", progress: 100 });

const STARS = [1, 2, 3, 4, 5];
const NO_ERRORS: ReviewFormState = { errors: {} };

/**
 * ฟอร์มเขียนและแก้รีวิว: ดาว 5 ดวง ข้อความพร้อมตัวนับ และรูปไม่เกิน 3 รูปที่ส่งขึ้นเซิร์ฟเวอร์ทันทีที่เลือก (REV-001 REV-002 REV-004)
 * ส่งไม่ผ่าน สิ่งที่กรอกไว้ยังอยู่ครบ
 */
export function ReviewForm({
  action,
  orderNo,
  itemId,
  editing,
  initial,
  cancelHref,
}: {
  action: SaveAction<ReviewFormState>;
  orderNo: string;
  itemId: number;
  editing: boolean;
  initial: { rating: number; body: string; images: string[] };
  cancelHref: string;
}) {
  const [rating, setRating] = useState(initial.rating);
  const [body, setBody] = useState(initial.body);
  const [items, setItems] = useState<ImageItem[]>(() => initial.images.map(savedImage));
  const [rejected, setRejected] = useState<{ name: string; error: string }[]>([]);
  const save = useSave(action, NO_ERRORS);

  const update = (id: string, patch: Partial<ImageItem>) =>
    setItems((list) => list.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  const send = (id: string, file: File) => {
    update(id, { status: "uploading", progress: 0, error: undefined });
    uploadFile("/review-images", file, UPLOAD_TIMEOUT_MS, MESSAGES.uploadFailed, (progress) => update(id, { progress })).then(
      (url) => update(id, { status: "done", url, progress: 100 }),
      (failure: Error) => update(id, { status: "failed", error: failure.message }),
    );
  };

  const pick = (files: File[]) => {
    const result = screenReviewFiles(items.length, files);
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

  return (
    <SaveForm
      save={save}
      label={editing ? "บันทึก" : "ส่งรีวิว"}
      pendingLabel={editing ? "กำลังบันทึก" : "กำลังส่ง"}
      disabled={items.some((item) => item.status === "uploading")}
      extra={
        editing && (
          <Link href={cancelHref} className="link-action">
            ยกเลิก
          </Link>
        )
      }
    >
      {(state) => {
        const errors = "errors" in state ? state.errors : {};
        return (
          <>
            <input type="hidden" name="orderNo" value={orderNo} />
            <input type="hidden" name="itemId" value={itemId} />
            <input type="hidden" name="mode" value={editing ? "edit" : "new"} />
            {items.map((item) => item.status === "done" && item.url && <input key={item.id} type="hidden" name="image" value={item.url} />)}

            {errors.form && (
              <p role="alert" className="field-error">
                {errors.form}
              </p>
            )}

            <div>
              <fieldset className={styles.starPicker} aria-describedby={errors.rating ? "rating-error" : undefined}>
                <legend>คะแนน</legend>
                {STARS.map((star) => (
                  <label key={star} className={styles.starOption} data-filled={star <= rating}>
                    <input
                      type="radio"
                      name="rating"
                      value={star}
                      checked={rating === star}
                      onChange={() => setRating(star)}
                      className="visually-hidden"
                    />
                    <span aria-hidden="true">★</span>
                    <span className="visually-hidden">{star} ดาว</span>
                  </label>
                ))}
              </fieldset>
              {errors.rating && (
                <p id="rating-error" className="field-error">
                  {errors.rating}
                </p>
              )}
            </div>

            <div className="field">
              <label htmlFor="review-body">ข้อความ (ไม่บังคับ)</label>
              <textarea
                id="review-body"
                name="body"
                className="input"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                aria-invalid={errors.body ? true : undefined}
                aria-describedby={errors.body ? "review-body-error review-body-count" : "review-body-count"}
              />
              <span id="review-body-count" className={styles.counter}>
                {textLength(body)}/{LIMITS.body}
              </span>
              {errors.body && (
                <p id="review-body-error" className="field-error">
                  {errors.body}
                </p>
              )}
            </div>

            <fieldset className={styles.imagesField} aria-describedby={errors.images ? "review-images-error" : undefined}>
              <legend>รูป (ไม่บังคับ)</legend>
              <p className={styles.muted}>JPG หรือ PNG ไม่เกิน 5 MB ต่อรูป</p>
              {items.length > 0 && (
                <ul className={styles.pickedImages}>
                  {items.map((item, index) => (
                    <li key={item.id}>
                      <img src={item.preview} alt={`รูปที่ ${index + 1}`} />
                      {item.status === "uploading" && <progress max={100} value={item.progress} aria-label={`กำลังส่งรูปที่ ${index + 1}`} />}
                      {item.status === "failed" && (
                        <p role="alert" className="field-error">
                          {item.error ?? MESSAGES.uploadFailed}
                        </p>
                      )}
                      {item.status === "failed" && item.file && (
                        <button type="button" className="link-action" onClick={() => send(item.id, item.file as File)}>
                          ลองใหม่
                        </button>
                      )}
                      <button type="button" className="link-action" aria-label={`ลบรูปที่ ${index + 1}`} onClick={() => remove(item)}>
                        ลบ
                      </button>
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
                    disabled={items.length >= LIMITS.images}
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
                <ul role="alert" className={styles.list}>
                  {rejected.map((file, index) => (
                    <li key={index} className="field-error">
                      {file.name}: {file.error}
                    </li>
                  ))}
                </ul>
              )}
              {errors.images && (
                <p id="review-images-error" className="field-error">
                  {errors.images}
                </p>
              )}
            </fieldset>
          </>
        );
      }}
    </SaveForm>
  );
}
