// ภาพแผนที่ใน e2e ไม่พึ่งเซิร์ฟเวอร์ของ OpenStreetMap ทุกคำขอได้ภาพสีพื้น 1 จุดจากในเครื่อง
import type { BrowserContext, Page, Route } from "@playwright/test";

export const isTile = (url: URL) => url.hostname === "tile.openstreetmap.org";

const STUB_TILE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGN48+wWAAVuAq1F8TmrAAAAAElFTkSuQmCC",
  "base64",
);

export const serveStubTile = (route: Route) => route.fulfill({ contentType: "image/png", body: STUB_TILE });

export const stubTiles = (target: Page | BrowserContext) => target.route(isTile, serveStubTile);
