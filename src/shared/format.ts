const numberFormat = new Intl.NumberFormat("en-US");

// en-GB ให้รูปแบบ 24/11/2026 ส่วน th-TH จะได้ปี พ.ศ. ซึ่งไม่ตรงกับ requirement
const dateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Bangkok",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Bangkok",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** 1000 → "1,000" */
export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

/** เงินเป็นจำนวนเต็มบาท: 1290 → "฿1,290" */
export function formatBaht(baht: number): string {
  if (!Number.isInteger(baht)) throw new Error(`เงินต้องเป็นจำนวนเต็มบาท ได้ ${baht}`);
  return `฿${formatNumber(baht)}`;
}

/** เวลา ISO หรือ Date → "24/11/2026" ตามเวลาประเทศไทย */
export function formatDate(value: Date | string): string {
  return dateFormat.format(new Date(value));
}

/** เวลา ISO หรือ Date → "24/11/2026 09:15" ตามเวลาประเทศไทย */
export function formatDateTime(value: Date | string): string {
  const date = new Date(value);
  return `${dateFormat.format(date)} ${timeFormat.format(date)}`;
}
