import { saveImageFile } from "@/features/product-listing/server/image-files";
import { LIMITS, MESSAGES } from "@/features/product-listing/server/product-rules";
import { getDb } from "@/shared/db";
import { getCurrentAccount } from "@/shared/session";

/** หน้าฟอร์มสินค้าส่งรูปทีละรูปมาที่นี่ก่อนกดบันทึก เนื้อคำขอคือไฟล์รูปทั้งไฟล์ (PRD-003) */
export async function POST(request: Request) {
  const viewer = await getCurrentAccount();
  if (viewer?.shopId == null) return Response.json({ error: MESSAGES.uploadFailed }, { status: 401 });
  if (Number(request.headers.get("content-length")) > LIMITS.imageBytes) {
    return Response.json({ error: MESSAGES.imageTooLarge }, { status: 413 });
  }
  const result = saveImageFile(getDb(), viewer.shopId, new Uint8Array(await request.arrayBuffer()));
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  return Response.json({ url: result.url });
}
