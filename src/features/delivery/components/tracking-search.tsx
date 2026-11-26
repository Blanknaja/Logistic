import { RouteArt } from "@/features/browse/components/route-art";
import styles from "./tracking.module.css";

export const SEARCH_HINT = "พิมพ์เลขติดตามพัสดุ เช่น BS0000000123";

/** ช่องค้นหาพัสดุ (DLV-011) error เป็น null ก่อนค้นหาครั้งแรก */
export function TrackingSearch({ value, error }: { value: string; error: string | null }) {
  return (
    <div className={`card ${styles.searchPage}`}>
      <RouteArt travel="once" className={styles.searchArt} />
      <h1>ติดตามพัสดุ</h1>
      <form action="/track" method="get" className={styles.search}>
        <div className={`field ${styles.searchField}`}>
          <label htmlFor="tracking-no">เลขติดตามพัสดุ</label>
          <input
            id="tracking-no"
            name="no"
            className="input"
            defaultValue={value}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby="tracking-no-message"
          />
        </div>
        <button type="submit" className="button">
          ค้นหา
        </button>
      </form>
      <p id="tracking-no-message" role={error ? "alert" : undefined} className={error ? "field-error" : styles.note}>
        {error ?? SEARCH_HINT}
      </p>
    </div>
  );
}
