import styles from "./home.module.css";

/** เส้นทางที่พัสดุเดินตาม ใช้ทั้งเส้นประและ offset-path ของกล่อง (ค่าใน home.module.css ต้องตรงกัน) */
const ROUTE = "M128 150 C 190 20, 290 20, 352 150";

/**
 * ภาพประจำเว็บ: พัสดุเดินตามเส้นประจากร้านถึงบ้าน วาดด้วย SVG จึงเห็นครบแม้สคริปต์ไม่ทำงาน
 * travel="once" กล่องเดินหนึ่งครั้งตอนเปิดหน้า travel="scroll" กล่องเดินตามการเลื่อนหน้า
 */
export function RouteArt({ travel, className = "" }: { travel: "once" | "scroll"; className?: string }) {
  return (
    <svg viewBox="0 0 480 200" className={`${styles.art} ${className}`} aria-hidden="true" focusable="false">
      <ellipse className={styles.artGround} cx="240" cy="178" rx="228" ry="20" />
      <path className={styles.artRoute} d={ROUTE} pathLength="1" />

      <g className={styles.artLine}>
        <rect className={styles.artWall} x="38" y="96" width="96" height="82" rx="6" />
        <path className={styles.artAwning} d="M30 96h112l-8-26H38l-8 26Z" />
        <path d="M58 70v26M86 70v26M114 70v26" />
        <rect className={styles.artDoor} x="56" y="128" width="26" height="50" rx="3" />
        <rect className={styles.artGlass} x="94" y="120" width="28" height="24" rx="3" />
      </g>

      <g className={styles.artLine}>
        <rect className={styles.artWall} x="356" y="104" width="84" height="74" rx="6" />
        <path className={styles.artRoof} d="M344 108 398 62l54 46Z" />
        <rect className={styles.artDoor} x="386" y="132" width="24" height="46" rx="3" />
        <circle className={styles.artGlass} cx="398" cy="92" r="8" />
      </g>

      <g className={`${styles.artParcel} ${travel === "once" ? styles.travelOnce : styles.travelScroll}`}>
        <g className={styles.artLine}>
          <path className={styles.artBoxTop} d="M0-34 26-22 0-10-26-22Z" />
          <path className={styles.artBoxSide} d="M-26-22 0-10v30l-26-12Z" />
          <path className={styles.artBoxFront} d="M26-22 0-10v30l26-12Z" />
          <path d="M-13-28 13-16v10" />
        </g>
      </g>
    </svg>
  );
}
