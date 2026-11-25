const numberFormat = new Intl.NumberFormat("en-US");

// ปี ค.ศ. เดือนเป็นเลข แล้วแปลงเดือนเป็นชื่อย่อไทยเอง เพราะ th-TH ให้ปี พ.ศ.
const partsFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Bangkok",
  day: "numeric",
  month: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** วัน เดือน ปี ชั่วโมง นาที ตามเวลาประเทศไทย */
function bangkok(value: Date | string) {
  const parts = Object.fromEntries(partsFormat.formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return {
    day: Number(parts.day),
    monthNumber: Number(parts.month),
    month: THAI_MONTHS[Number(parts.month) - 1],
    year: parts.year,
    time: `${parts.hour}:${parts.minute}`,
  };
}

/** 1000 → "1,000" */
export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

/** เงินเป็นจำนวนเต็มบาท: 1290 → "฿1,290" */
export function formatBaht(baht: number): string {
  if (!Number.isInteger(baht)) throw new Error(`เงินต้องเป็นจำนวนเต็มบาท ได้ ${baht}`);
  return `฿${formatNumber(baht)}`;
}

/** "25 พ.ย." ตามเวลาประเทศไทย ใส่ปี ค.ศ. เมื่อไม่ใช่ปีนี้: "25 พ.ย. 2025" */
export function formatThaiDate(value: Date | string, now: Date = new Date()): string {
  const date = bangkok(value);
  return date.year === bangkok(now).year ? `${date.day} ${date.month}` : `${date.day} ${date.month} ${date.year}`;
}

/** "25 พ.ย. 13:07" ตามเวลาประเทศไทย ใส่ปี ค.ศ. เมื่อไม่ใช่ปีนี้: "25 พ.ย. 2025 13:07" */
export function formatThaiDateTime(value: Date | string, now: Date = new Date()): string {
  return `${formatThaiDate(value, now)} ${formatTime(value)}`;
}

/** "13:07" ตามเวลาประเทศไทย */
export function formatTime(value: Date | string): string {
  return bangkok(value).time;
}

/** เวลาของวันนี้ตามเวลาประเทศไทยได้ "09:15" วันอื่นได้ "24 พ.ย. 09:15" */
export function formatTimeOrDateTime(value: Date | string, now: Date = new Date()): string {
  const date = bangkok(value);
  const today = bangkok(now);
  const sameDay = date.day === today.day && date.month === today.month && date.year === today.year;
  return sameDay ? date.time : formatThaiDateTime(value, now);
}

/**
 * รูปแบบเดิม "24/11/2026 09:15" ตามเวลาประเทศไทย
 * @deprecated ใช้ formatThaiDateTime test ใน format.test.ts ห้ามใช้นอก src/features/delivery
 */
export function formatDateTime(value: Date | string): string {
  const { day, monthNumber, year, time } = bangkok(value);
  return `${String(day).padStart(2, "0")}/${String(monthNumber).padStart(2, "0")}/${year} ${time}`;
}
