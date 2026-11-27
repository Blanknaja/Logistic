import { getReviewImage } from "@/features/review/server/image-files";
import { getDb } from "@/shared/db";
import { getCurrentAccount } from "@/shared/session";

export async function GET(request: Request, ctx: RouteContext<"/review-images/[key]">) {
  const { key } = await ctx.params;
  // รูปของรีวิวที่แสดงอยู่ไม่ต้องรู้ว่าใครขอ จึงไม่อ่านการเข้าสู่ระบบ
  const file = getReviewImage(getDb(), key, null) ?? getReviewImage(getDb(), key, await getCurrentAccount());
  if (!file) return new Response("ไม่พบ", { status: 404 });
  const headers = {
    "Content-Type": file.contentType,
    "X-Content-Type-Options": "nosniff",
    // รีวิวถูกซ่อนได้ทุกเมื่อ เบราว์เซอร์จึงต้องถามสิทธิ์ใหม่ทุกครั้งก่อนใช้รูปที่เก็บไว้
    "Cache-Control": "private, no-cache",
    ETag: `"${key}"`,
  };
  if (request.headers.get("If-None-Match") === headers.ETag) return new Response(null, { status: 304, headers });
  return new Response(new Uint8Array(file.data), { headers });
}
