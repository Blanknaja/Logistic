import { getModelFile } from "@/features/product-listing/server/model-files";
import { getDb } from "@/shared/db";

export async function GET(_request: Request, ctx: RouteContext<"/product-models/[key]">) {
  const file = getModelFile(getDb(), (await ctx.params).key);
  if (!file) return new Response("ไม่พบ", { status: 404 });
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": "model/gltf-binary",
      "X-Content-Type-Options": "nosniff",
      // key ของไฟล์ไม่ซ้ำและไฟล์ไม่ถูกแก้ทับ
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
