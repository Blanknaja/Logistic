import { saveModelFile } from "@/features/product-listing/server/model-files";
import { LIMITS, MESSAGES } from "@/features/product-listing/server/product-rules";
import { getDb } from "@/shared/db";
import { readBodyUpTo } from "@/shared/read-body";
import { getCurrentAccount } from "@/shared/session";

/** หน้าฟอร์มสินค้าส่งไฟล์ 3 มิติมาที่นี่ก่อนกดบันทึก เนื้อคำขอคือไฟล์ทั้งไฟล์ ชื่อไฟล์อยู่ใน ?name= (P3D-001) */
export async function POST(request: Request) {
  const viewer = await getCurrentAccount();
  if (viewer?.shopId == null) return Response.json({ error: MESSAGES.modelUploadFailed }, { status: 401 });
  const bytes = await readBodyUpTo(request, LIMITS.modelBytes);
  if (!bytes) return Response.json({ error: MESSAGES.modelTooLarge }, { status: 413 });
  const name = new URL(request.url).searchParams.get("name") ?? "";
  const result = saveModelFile(getDb(), viewer.shopId, name, bytes);
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  return Response.json({ url: result.url });
}
