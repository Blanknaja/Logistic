import { describe, expect, test } from "vitest";
import { formatBaht, formatDate, formatDateTime, formatNumber, formatTimeOrDateTime } from "@/shared/format";

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

describe("formatDate", () => {
  test("แสดงวันแบบ วัน/เดือน/ปี ค.ศ.", () => {
    expect(formatDate("2026-11-24T03:00:00.000Z")).toBe("24/11/2026");
  });

  test("ใช้เวลาประเทศไทย ไม่ใช่เวลาของเครื่อง", () => {
    // 17:30 UTC คือ 00:30 ของวันถัดไปในไทย
    expect(formatDate(new Date("2026-11-24T17:30:00.000Z"))).toBe("25/11/2026");
  });
});

describe("formatDateTime", () => {
  test("แสดงวันและเวลาแบบ 24 ชั่วโมง ตามเวลาประเทศไทย", () => {
    expect(formatDateTime("2026-11-24T02:15:00.000Z")).toBe("24/11/2026 09:15");
    expect(formatDateTime("2026-11-24T17:30:00.000Z")).toBe("25/11/2026 00:30");
  });
});

describe("formatTimeOrDateTime", () => {
  test("วันเดียวกันตามเวลาประเทศไทยแสดงแค่เวลา วันอื่นแสดงวันที่ด้วย", () => {
    const now = new Date("2026-11-25T10:00:00.000Z");
    expect(formatTimeOrDateTime("2026-11-25T03:15:00.000Z", now)).toBe("10:15");
    expect(formatTimeOrDateTime("2026-11-24T16:59:00.000Z", now)).toBe("24/11/2026 23:59");
    expect(formatTimeOrDateTime("2026-11-24T17:00:00.000Z", now)).toBe("00:00");
  });
});
