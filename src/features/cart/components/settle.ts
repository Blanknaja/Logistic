import { unstable_rethrow } from "next/navigation";
import { ACTION_TIMEOUT_MS } from "@/features/account/components/action-form";

/** ผลของ server action หรือ null เมื่อเน็ตหลุด เซิร์ฟเวอร์ผิดพลาด หรือไม่ได้ผลใน 10 วินาที (CRT-009) */
export async function settle<T>(running: Promise<T>, ms = ACTION_TIMEOUT_MS): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  // ถ้าหมดเวลาไปก่อน ผลที่มาทีหลังไม่มีใครรอแล้ว
  running.catch(() => {});
  try {
    return await Promise.race([running, new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), ms)))]);
  } catch (error) {
    // redirect() ของ server action มาในรูป error ต้องปล่อยให้ Next.js พาไปหน้าใหม่
    unstable_rethrow(error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
