import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { LOADING_TIMEOUT_MS, LoadingTimeout } from "@/shared/ui/loading-timeout";
import { ResultsSkeleton } from "@/features/browse/components/skeletons";

describe("BRW-013 หน้าผิดพลาด", () => {
  test("ระหว่างรอแสดงโครงสีเทา และถือว่าโหลดไม่สำเร็จเมื่อเกิน 10 วินาที", () => {
    const html = renderToStaticMarkup(
      <LoadingTimeout>
        <ResultsSkeleton />
      </LoadingTimeout>,
    );
    expect(html).toContain("data-skeleton-card");
    expect(html).not.toContain("โหลดข้อมูลไม่สำเร็จ");
    expect(LOADING_TIMEOUT_MS).toBe(10_000);
  });
});
