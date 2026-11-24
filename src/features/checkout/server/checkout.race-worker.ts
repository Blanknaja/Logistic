// worker ของ checkout.race.test.ts: เปิดการเชื่อมต่อฐานข้อมูลของตัวเอง แล้วกดสั่งซื้อพร้อมกับ worker อื่นทุกรอบ

import { parentPort, workerData } from "node:worker_threads";
import { placeOrder, type PlaceOrderInput, type PlaceOrderResult } from "@/features/checkout/server/checkout";
import { openDb } from "@/shared/db";

export type RaceJob = { path: string; barrier: SharedArrayBuffer; parties: number; presses: PlaceOrderInput[] };

const { path, barrier, parties, presses } = workerData as RaceJob;
const db = openDb(path);
const sync = new Int32Array(barrier);

// ช่อง 0 นับคนที่มาถึง ช่อง 1 คือรอบ คนสุดท้ายที่มาถึงปล่อยทุกคนออกไปพร้อมกัน
function waitForEveryone() {
  const round = Atomics.load(sync, 1);
  if (Atomics.add(sync, 0, 1) === parties - 1) {
    Atomics.store(sync, 0, 0);
    Atomics.add(sync, 1, 1);
    Atomics.notify(sync, 1);
  } else {
    Atomics.wait(sync, 1, round);
  }
}

const results: PlaceOrderResult[] = presses.map((input) => {
  waitForEveryone();
  return placeOrder(db, input);
});
db.close();
parentPort?.postMessage(results);
