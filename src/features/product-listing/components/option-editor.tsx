"use client";

import { useState } from "react";
import {
  addOptionValue,
  LIMITS,
  MESSAGES,
  variantCombos,
  type OptionInput,
  type ProductErrors,
} from "@/features/product-listing/server/product-rules";
import styles from "./product-listing.module.css";

/** ตัวเลือกในหน้าฟอร์ม id ใช้แยกแถวเมื่อลบตัวเลือกที่อยู่ก่อน */
export type EditableOption = OptionInput & { id: number };

function ErrorText({ id, text }: { id: string; text?: string }) {
  return text ? (
    <p id={id} className="field-error">
      {text}
    </p>
  ) : null;
}

function OptionRow({
  index,
  option,
  errors,
  onChange,
  onRemove,
}: {
  index: number;
  option: EditableOption;
  errors: ProductErrors;
  onChange: (option: EditableOption) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [valueError, setValueError] = useState<string>();
  const nameId = `option-${option.id}-name`;
  const valueId = `option-${option.id}-value`;
  const nameError = errors[`option.${index}.name`];
  const valuesError = valueError ?? errors[`option.${index}.values`];

  const add = () => {
    const result = addOptionValue(option.values, draft);
    if ("error" in result) {
      setValueError(result.error);
      return;
    }
    setValueError(undefined);
    setDraft("");
    onChange({ ...option, values: result.values });
  };

  return (
    <div className={styles.option}>
      <div className="field">
        <label htmlFor={nameId}>ชื่อตัวเลือกที่ {index + 1}</label>
        <input
          id={nameId}
          className="input"
          maxLength={LIMITS.label}
          placeholder="เช่น สี หรือ ขนาด"
          value={option.name}
          onChange={(event) => onChange({ ...option, name: event.target.value })}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? `${nameId}-error` : undefined}
        />
        <ErrorText id={`${nameId}-error`} text={nameError} />
      </div>

      {option.values.length > 0 && (
        <ul className="chips" aria-label={`ค่าของ ${option.name || `ตัวเลือกที่ ${index + 1}`}`}>
          {option.values.map((value) => (
            <li key={value} className="chip">
              {value}
              <button
                type="button"
                className={styles.chipRemove}
                aria-label={`ลบค่า ${value}`}
                onClick={() => onChange({ ...option, values: option.values.filter((other) => other !== value) })}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="field">
        <label htmlFor={valueId}>เพิ่มค่าตัวเลือก</label>
        <div className={styles.inline}>
          <input
            id={valueId}
            className="input"
            maxLength={LIMITS.label}
            placeholder="เช่น แดง หรือ M"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
            }}
            aria-invalid={valuesError ? true : undefined}
            aria-describedby={valuesError ? `${valueId}-error` : undefined}
          />
          <button type="button" className="button button-secondary" onClick={add}>
            เพิ่ม
          </button>
        </div>
        <ErrorText id={`${valueId}-error`} text={valuesError} />
      </div>

      <div>
        <button type="button" className="button button-secondary" onClick={onRemove}>
          ลบตัวเลือกนี้
        </button>
      </div>
    </div>
  );
}

/** ตัวเลือก ค่าตัวเลือก และราคาของทุกแบบย่อย (PRD-004) */
export function OptionEditor({
  options,
  setOptions,
  prices,
  setPrices,
  errors,
}: {
  options: EditableOption[];
  setOptions: (options: EditableOption[]) => void;
  prices: Record<string, string>;
  setPrices: (prices: Record<string, string>) => void;
  errors: ProductErrors;
}) {
  const combos = variantCombos(options);
  const full = options.length >= LIMITS.options;
  const single = combos.length === 1 && combos[0].values.length === 0;
  const priceInput = (key: string, label: string, id: string) => {
    const error = errors[`price.${key}`];
    return (
      <>
        <input
          id={id}
          className="input"
          inputMode="numeric"
          aria-label={label}
          value={prices[key] ?? ""}
          onChange={(event) => setPrices({ ...prices, [key]: event.target.value })}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <ErrorText id={`${id}-error`} text={error} />
      </>
    );
  };

  return (
    <>
      <fieldset className={styles.section}>
        <legend>ตัวเลือก</legend>
        <p className={styles.hint}>เช่น สี หรือ ขนาด ไม่มีตัวเลือกก็ได้ ใส่ได้ไม่เกิน 2 ตัวเลือก ตัวเลือกละไม่เกิน 10 ค่า</p>
        {options.map((option, index) => (
          <OptionRow
            key={option.id}
            index={index}
            option={option}
            errors={errors}
            onChange={(changed) => setOptions(options.map((other) => (other.id === option.id ? changed : other)))}
            onRemove={() => setOptions(options.filter((other) => other.id !== option.id))}
          />
        ))}
        <div className={styles.option}>
          <div>
            <button
              type="button"
              className="button button-secondary"
              disabled={full}
              aria-describedby={full ? "options-full" : undefined}
              onClick={() => setOptions([...options, { id: Math.max(0, ...options.map((o) => o.id)) + 1, name: "", values: [] }])}
            >
              เพิ่มตัวเลือก
            </button>
          </div>
          {full && (
            <p id="options-full" className={styles.hint}>
              {MESSAGES.tooManyOptions}
            </p>
          )}
          <ErrorText id="options-error" text={errors.options} />
        </div>
      </fieldset>

      <fieldset className={styles.section}>
        <legend>ราคา</legend>
        {single ? (
          <div className="field">
            <label htmlFor="price-single">ราคา (บาท)</label>
            {priceInput(combos[0].key, "ราคา (บาท)", "price-single")}
          </div>
        ) : (
          <table className={styles.variants}>
            <caption>แบบย่อย {combos.length} แบบ ราคาเป็นบาท</caption>
            <thead>
              <tr>
                <th scope="col">แบบย่อย</th>
                <th scope="col">ราคา (บาท)</th>
              </tr>
            </thead>
            <tbody>
              {combos.map((combo, i) => (
                <tr key={combo.key}>
                  <th scope="row">{combo.label}</th>
                  <td>{priceInput(combo.key, `ราคา ${combo.label}`, `price-${i}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className={styles.hint}>จำนวนเต็ม 1 ถึง 1,000,000 บาท สต็อกของแบบย่อยใหม่เริ่มที่ 0 ตั้งได้ที่หน้าสต็อก</p>
      </fieldset>
    </>
  );
}
