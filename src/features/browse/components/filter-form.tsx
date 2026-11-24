"use client";

import Form from "next/form";
import { useState, type FormEvent } from "react";
import { parsePrice, priceError, SORT_LABELS, type BrowseParams } from "@/features/browse/search-params";
import styles from "./browse.module.css";

const digitsOnly = (value: string) => value.replace(/\D/g, "");

/** ช่วงราคาและการเรียง ส่งแล้วกลับไปหน้า 1 โดยคงคำค้นและหมวดหมู่ไว้ (BRW-003 ถึง BRW-005) */
export function FilterForm({ params, initialError }: { params: BrowseParams; initialError: string | null }) {
  const [min, setMin] = useState(params.min === null ? "" : String(params.min));
  const [max, setMax] = useState(params.max === null ? "" : String(params.max));
  const [error, setError] = useState(initialError);

  // ช่วงราคาผิดไม่ส่งฟอร์ม ผลลัพธ์เดิมจึงยังอยู่ (BRW-004)
  function validate(event: FormEvent<HTMLFormElement>) {
    const message = priceError(parsePrice(min), parsePrice(max));
    setError(message);
    if (message) event.preventDefault();
  }

  return (
    <Form action="/" onSubmit={validate} className={styles.filters}>
      {params.q && <input type="hidden" name="q" value={params.q} />}
      {params.category && <input type="hidden" name="category" value={params.category} />}
      <fieldset className={styles.price}>
        <legend>ช่วงราคา (บาท)</legend>
        <input
          name="min"
          value={min}
          onChange={(event) => setMin(digitsOnly(event.target.value))}
          inputMode="numeric"
          maxLength={7}
          className="input"
          aria-label="ราคาต่ำสุด"
          placeholder="ต่ำสุด"
        />
        <span aria-hidden="true">-</span>
        <input
          name="max"
          value={max}
          onChange={(event) => setMax(digitsOnly(event.target.value))}
          inputMode="numeric"
          maxLength={7}
          className="input"
          aria-label="ราคาสูงสุด"
          placeholder="สูงสุด"
        />
        <button type="submit" className="button button-secondary">
          ใช้ตัวกรอง
        </button>
        {error && (
          <p className={`field-error ${styles.priceError}`} role="alert">
            {error}
          </p>
        )}
      </fieldset>
      <label className={styles.sort}>
        เรียงตาม
        <select
          name="sort"
          defaultValue={params.sort}
          className="input"
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
        >
          {Object.entries(SORT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </Form>
  );
}
