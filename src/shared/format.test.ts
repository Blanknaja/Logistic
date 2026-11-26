import { describe, expect, test } from "vitest";
import {
  formatBaht,
  formatNumber,
  formatThaiDate,
  formatThaiDateTime,
  formatTime,
  formatTimeOrDateTime,
} from "@/shared/format";

describe("formatBaht", () => {
  test.each([
    [1290, "฿1,290"],
    [0, "฿0"],
    [40, "฿40"],
    [1_000_000, "฿1,000,000"],
  ])("%i บาท แสดงเป็น %s", (baht, text) => {
    expect(formatBaht(baht)).toBe(text);
  });

  test("ไม่รับเงินที่มีเศษสตางค์ เพราะระบบเก็บเงินเป็นบาทเต็ม", () => {
    expect(() => formatBaht(12.5)).toThrow();
  });
});

describe("formatNumber", () => {
  test("ใส่จุลภาคทุกสามหลัก", () => {
    expect(formatNumber(1000)).toBe("1,000");
    expect(formatNumber(7)).toBe("7");
  });
});

// ทุก test กำหนดวันนี้เอง ผลจึงไม่เปลี่ยนเมื่อขึ้นปีใหม่
const now = new Date("2026-11-25T10:00:00.000Z");

describe("formatThaiDate", () => {
  test("แสดงวันกับชื่อเดือนย่อภาษาไทย ไม่มีปีเมื่อเป็นปีนี้", () => {
    expect(formatThaiDate("2026-11-24T03:00:00.000Z", now)).toBe("24 พ.ย.");
    expect(formatThaiDate("2026-01-05T03:00:00.000Z", now)).toBe("5 ม.ค.");
  });

  test("ปีอื่นต่อท้ายด้วยปี ค.ศ.", () => {
    expect(formatThaiDate("2025-11-25T03:00:00.000Z", now)).toBe("25 พ.ย. 2025");
    expect(formatThaiDate("2027-12-31T03:00:00.000Z", now)).toBe("31 ธ.ค. 2027");
  });

  test("ใช้เวลาประเทศไทย ไม่ใช่เวลาของเครื่อง", () => {
    // 17:30 UTC คือ 00:30 ของวันถัดไปในไทย
    expect(formatThaiDate(new Date("2026-11-24T17:30:00.000Z"), now)).toBe("25 พ.ย.");
    // 31 ธ.ค. 17:00 UTC เป็นวันขึ้นปีใหม่ในไทยแล้ว
    expect(formatThaiDate("2025-12-31T17:00:00.000Z", now)).toBe("1 ม.ค.");
  });
});

describe("formatThaiDateTime", () => {
  test("แสดงวันและเวลาแบบ 24 ชั่วโมง ตามเวลาประเทศไทย", () => {
    expect(formatThaiDateTime("2026-11-24T02:15:00.000Z", now)).toBe("24 พ.ย. 09:15");
    expect(formatThaiDateTime("2026-11-24T17:30:00.000Z", now)).toBe("25 พ.ย. 00:30");
    expect(formatThaiDateTime("2025-11-25T06:07:00.000Z", now)).toBe("25 พ.ย. 2025 13:07");
  });
});

describe("formatTime", () => {
  test("แสดงแค่เวลาของประเทศไทย", () => {
    expect(formatTime("2026-11-24T17:30:00.000Z")).toBe("00:30");
  });
});

describe("formatTimeOrDateTime", () => {
  test("วันเดียวกันตามเวลาประเทศไทยแสดงแค่เวลา วันอื่นแสดงวันที่ด้วย", () => {
    expect(formatTimeOrDateTime("2026-11-25T03:15:00.000Z", now)).toBe("10:15");
    expect(formatTimeOrDateTime("2026-11-24T16:59:00.000Z", now)).toBe("24 พ.ย. 23:59");
    expect(formatTimeOrDateTime("2026-11-24T17:00:00.000Z", now)).toBe("00:00");
    expect(formatTimeOrDateTime("2025-11-25T03:15:00.000Z", now)).toBe("25 พ.ย. 2025 10:15");
  });
});
