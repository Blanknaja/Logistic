import { getReviewImage } from "@/features/review/server/image-files";
import { getDb } from "@/shared/db";

export async function GET(_request: Request, ctx: RouteContext<"/review-images/[key]">) {
  const file = getReviewImage(getDb(), (await ctx.params).key);
  if (!file) return new Response("ไม่พบ", { status: 404 });
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.contentType,
      "X-Content-Type-Options": "nosniff",
      // key ของรูปไม่ซ้ำและรูปไม่ถูกแก้ทับ
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
