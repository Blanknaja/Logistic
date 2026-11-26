import { LIMITS, MESSAGES } from "@/features/review/rules";
import { saveReviewImage } from "@/features/review/server/image-files";
import { getDb } from "@/shared/db";
import { readBodyUpTo } from "@/shared/read-body";
import { getCurrentAccount } from "@/shared/session";

/** หน้าเขียนรีวิวส่งรูปทีละรูปมาที่นี่ก่อนกดส่งรีวิว เนื้อคำขอคือไฟล์รูปทั้งไฟล์ (REV-002) */
export async function POST(request: Request) {
  const viewer = await getCurrentAccount();
  if (!viewer) return Response.json({ error: MESSAGES.uploadFailed }, { status: 401 });
  const bytes = await readBodyUpTo(request, LIMITS.imageBytes);
  if (!bytes) return Response.json({ error: MESSAGES.imageTooLarge }, { status: 413 });
  const result = saveReviewImage(getDb(), viewer.id, bytes);
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  return Response.json({ url: result.url });
}
