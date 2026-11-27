import { expect, test, vi } from "vitest";
import { createSizer } from "./parcel-scene";

test("ฉาก 3 มิติตั้งขนาดของตัววาดเฉพาะเมื่อขนาดของ canvas เปลี่ยน ไม่ใช่ทุกเฟรม", () => {
  const renderer = { setSize: vi.fn() };
  const camera = { aspect: 1, updateProjectionMatrix: vi.fn() };
  const fit = createSizer(renderer, camera);

  expect(fit(0, 300)).toBe(false);
  expect(renderer.setSize).not.toHaveBeenCalled();

  for (let frame = 0; frame < 60; frame++) expect(fit(800, 400)).toBe(true);
  expect(renderer.setSize).toHaveBeenCalledTimes(1);
  expect(renderer.setSize).toHaveBeenCalledWith(800, 400, false);
  expect(camera.aspect).toBe(2);
  expect(camera.updateProjectionMatrix).toHaveBeenCalledTimes(1);

  fit(600, 400);
  fit(600, 400);
  expect(renderer.setSize).toHaveBeenCalledTimes(2);
  expect(camera.aspect).toBe(1.5);
});
