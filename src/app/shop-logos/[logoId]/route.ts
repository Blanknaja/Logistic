import { getShopLogo } from "@/features/shop/server/shops";
import { getDb } from "@/shared/db";

export async function GET(_request: Request, ctx: RouteContext<"/shop-logos/[logoId]">) {
  const { logoId } = await ctx.params;
  const logo = /^\d+$/.test(logoId) ? getShopLogo(getDb(), Number(logoId)) : null;
  if (!logo) return new Response("ไม่พบ", { status: 404 });
  return new Response(logo.data, {
    headers: {
      "Content-Type": logo.contentType,
      // รูปใหม่ได้ที่อยู่ใหม่เสมอ เก็บไว้ได้นาน
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
