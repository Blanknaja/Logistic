"use client";

import Form from "next/form";
import { useState } from "react";
import { MIN_QUERY_LENGTH, QUERY_TOO_SHORT, type StatusKey } from "@/features/shop-orders/paths";
import styles from "./shop-orders.module.css";

/** คำค้นสั้นเกินไม่พาไปไหน รายการที่แสดงอยู่จึงไม่เปลี่ยน (ORD-003) */
export function SearchForm({ q, status, error }: { q: string; status: StatusKey | null; error: string | null }) {
  const [message, setMessage] = useState(error);
  return (
    <Form
      action="/seller/orders"
      role="search"
      className={styles.search}
      onSubmit={(event) => {
        const value = String(new FormData(event.currentTarget).get("q") ?? "").trim();
        const tooShort = value.length < MIN_QUERY_LENGTH;
        if (tooShort) event.preventDefault();
        setMessage(tooShort ? QUERY_TOO_SHORT : null);
      }}
    >
      {status && <input type="hidden" name="status" value={status} />}
      <input
        type="search"
        name="q"
        defaultValue={q}
        maxLength={50}
        className="input"
        aria-label="เลขคำสั่งซื้อ"
        placeholder="ค้นหาเลขคำสั่งซื้อ"
        aria-invalid={message ? true : undefined}
      />
      <button type="submit" className="button">
        ค้นหา
      </button>
      {message && (
        <p role="alert" className={`field-error ${styles.error}`}>
          {message}
        </p>
      )}
    </Form>
  );
}
