"use client";

import { useState, type ReactNode } from "react";
import type { ModerationState } from "@/features/review/actions";
import styles from "./review.module.css";
import { SaveForm, useSave, type SaveAction } from "./save-form";

type Action = SaveAction<ModerationState>;

const NOTHING: ModerationState = { error: null };

/** ปุ่มที่กางฟอร์มหนึ่งช่องออกมา บันทึกสำเร็จแล้วพับกลับ ไม่สำเร็จข้อความที่กรอกยังอยู่ */
function DisclosureForm({
  action,
  summary,
  label,
  pendingLabel,
  children,
}: {
  action: Action;
  summary: string;
  label: string;
  pendingLabel: string;
  children: (error: string | null) => ReactNode;
}) {
  const [toggled, setToggled] = useState<boolean>();
  const save = useSave(action, NOTHING, (result) => {
    if (result.error === null) setToggled(false);
  });
  const error = "error" in save.state ? save.state.error : null;
  // หน้าที่ตอบกลับฟอร์มที่เบราว์เซอร์ส่งเองต้องกางไว้ให้เห็นข้อความที่ไม่ผ่าน
  const open = toggled ?? error !== null;
  return (
    <details className={styles.disclosure} open={open} onToggle={(event) => setToggled(event.currentTarget.open)}>
      <summary className="button button-secondary">{summary}</summary>
      <SaveForm save={save} label={label} pendingLabel={pendingLabel}>
        {() => children(error)}
      </SaveForm>
    </details>
  );
}

/** ร้านตอบรีวิว หรือแก้คำตอบที่มีอยู่ (REV-015) */
export function ReplyForm({ action, reviewId, reply }: { action: Action; reviewId: number; reply: string | null }) {
  const id = `reply-${reviewId}`;
  return (
    <DisclosureForm
      action={action}
      summary={reply === null ? "ตอบรีวิว" : "แก้ไขคำตอบ"}
      label={reply === null ? "ส่งคำตอบ" : "บันทึก"}
      pendingLabel="กำลังบันทึก"
    >
      {(error) => (
        <div className="field">
          <input type="hidden" name="reviewId" value={reviewId} />
          <input type="hidden" name="editing" value={reply === null ? "" : "1"} />
          <label htmlFor={id}>คำตอบของร้าน</label>
          <textarea
            id={id}
            name="body"
            className="input"
            defaultValue={reply ?? ""}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
          />
          {error && (
            <p id={`${id}-error`} className="field-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </DisclosureForm>
  );
}

/** ผู้ดูแลแพลตฟอร์มซ่อนรีวิวพร้อมเหตุผล (REV-016) */
export function HideForm({ action, reviewId }: { action: Action; reviewId: number }) {
  const id = `hide-${reviewId}`;
  return (
    <DisclosureForm action={action} summary="ซ่อนรีวิว" label="ยืนยัน" pendingLabel="กำลังซ่อน">
      {(error) => (
        <div className="field">
          <input type="hidden" name="reviewId" value={reviewId} />
          <label htmlFor={id}>เหตุผลที่ซ่อน</label>
          <input
            id={id}
            name="reason"
            className="input"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
          />
          {error && (
            <p id={`${id}-error`} className="field-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </DisclosureForm>
  );
}

/** ผู้ดูแลแพลตฟอร์มเลิกซ่อนรีวิว (REV-016) */
export function UnhideForm({ action, reviewId }: { action: Action; reviewId: number }) {
  const save = useSave(action, NOTHING);
  return (
    <SaveForm save={save} label="เลิกซ่อน" pendingLabel="กำลังเลิกซ่อน" secondary>
      {() => <input type="hidden" name="reviewId" value={reviewId} />}
    </SaveForm>
  );
}
