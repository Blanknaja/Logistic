import { unstable_rethrow } from "next/navigation";

/** หน้าเว็บรอผลจาก server action ได้นานสุดเท่านี้ เกินแล้วถือว่าไม่สำเร็จ */
export const ACTION_TIMEOUT_MS = 10_000;

export type Failed = { failed: true };

/**
 * ผลของ server action หรือ { failed: true } เมื่อเน็ตหลุด เซิร์ฟเวอร์ผิดพลาด หรือไม่ได้ผลภายใน ms
 * แทนการโยน error ทั้งหน้า
 */
export async function settle<T>(running: Promise<T>, ms = ACTION_TIMEOUT_MS): Promise<T | Failed> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  // ถ้าหมดเวลาไปก่อน ผลที่มาทีหลังไม่มีใครรอแล้ว
  running.catch(() => {});
  try {
    return await Promise.race([
      running,
      new Promise<Failed>((resolve) => {
        timer = setTimeout(() => resolve({ failed: true }), ms);
      }),
    ]);
  } catch (error) {
    // redirect() ของ server action มาในรูป error ต้องปล่อยให้ Next.js พาไปหน้าใหม่
    unstable_rethrow(error);
    return { failed: true };
  } finally {
    clearTimeout(timer);
  }
}

/** settle สำหรับ useActionState ผลครั้งก่อนไม่ถูกใช้ */
export function withTimeout<S>(action: (formData: FormData) => Promise<S>, ms = ACTION_TIMEOUT_MS) {
  return (_previous: unknown, formData: FormData): Promise<S | Failed> => settle(action(formData), ms);
}
