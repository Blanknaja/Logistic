"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { MESSAGES, modelFileError } from "@/features/product-listing/server/product-rules";
import { formatFileSize, MODEL_UPLOAD_TIMEOUT_MS, type ModelItem } from "./form-state";
import styles from "./product-listing.module.css";
import { uploadFile } from "./upload-file";

/** ไฟล์ 3 มิติที่บันทึกไว้แล้วของสินค้าที่เปิดมาแก้ */
export const savedModel = (url: string, saved: { name: string; size: number }): ModelItem => ({
  url,
  ...saved,
  file: null,
  status: "done",
  progress: 100,
});

/** เลือก เปลี่ยน และเอาไฟล์ 3 มิติออก ไฟล์ส่งขึ้นเซิร์ฟเวอร์ทันทีที่เลือก (P3D-001 P3D-002) */
export function ModelPicker({
  model,
  setModel,
  error,
}: {
  model: ModelItem | null;
  setModel: Dispatch<SetStateAction<ModelItem | null>>;
  error?: string;
}) {
  const [rejected, setRejected] = useState<string | null>(null);

  // ผลของไฟล์ที่ถูกเปลี่ยนหรือเอาออกไประหว่างส่ง ต้องไม่ทับไฟล์ที่อยู่ในช่องตอนนี้
  const update = (file: File, patch: Partial<ModelItem>) =>
    setModel((current) => (current?.file === file ? { ...current, ...patch } : current));

  const send = (file: File) => {
    update(file, { status: "uploading", progress: 0, error: undefined });
    uploadFile(`/product-models?name=${encodeURIComponent(file.name)}`, file, MODEL_UPLOAD_TIMEOUT_MS, MESSAGES.modelUploadFailed, (progress) =>
      update(file, { progress }),
    ).then(
      (url) => update(file, { status: "done", url, progress: 100 }),
      (failure: Error) => update(file, { status: "failed", error: failure.message }),
    );
  };

  const pick = async (file: File) => {
    const reason = modelFileError(new Uint8Array(await file.slice(0, 12).arrayBuffer()), file.size);
    setRejected(reason ? `${file.name}: ${reason}` : null);
    if (reason) return;
    setModel({ url: null, name: file.name, size: file.size, file, status: "uploading", progress: 0 });
    send(file);
  };

  const remove = () => {
    setRejected(null);
    setModel(null);
  };

  return (
    <fieldset className={styles.section} aria-describedby={error ? "model-error" : undefined}>
      <legend>ไฟล์ 3 มิติ</legend>
      <p className={styles.hint}>ไฟล์ .glb ไม่เกิน 10 MB ของในไฟล์ต้องมีขนาดจริง หน่วยเป็นเมตร</p>

      {model && (
        <div className={styles.modelFile}>
          <p>
            {model.name} {formatFileSize(model.size)}
          </p>
          {model.status === "uploading" && <progress max={100} value={model.progress} aria-label="กำลังส่งไฟล์ 3 มิติ" />}
          {model.status === "failed" && (
            <p role="alert" className="field-error">
              {model.error ?? MESSAGES.modelUploadFailed}
            </p>
          )}
          <div className={styles.imageActions}>
            {model.status === "failed" && model.file && (
              <button type="button" className="button button-secondary" onClick={() => send(model.file as File)}>
                ลองใหม่
              </button>
            )}
            <button type="button" className="button button-secondary" onClick={remove}>
              เอาออก
            </button>
          </div>
        </div>
      )}

      <div className={styles.picker}>
        <label>
          <input
            type="file"
            accept=".glb,model/gltf-binary"
            className={styles.fileInput}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void pick(file);
              event.target.value = "";
            }}
          />
          <span className="button button-secondary">{model ? "เปลี่ยนไฟล์ 3 มิติ" : "เลือกไฟล์ 3 มิติ"}</span>
        </label>
      </div>

      {rejected && (
        <p role="alert" className="field-error">
          {rejected}
        </p>
      )}
      {error && (
        <p id="model-error" className="field-error">
          {error}
        </p>
      )}
    </fieldset>
  );
}
