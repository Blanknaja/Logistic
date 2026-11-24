import { sampleImageSvg } from "@/shared/sample-image";

export async function GET(_request: Request, ctx: RouteContext<"/sample-images/[file]">) {
  const svg = sampleImageSvg((await ctx.params).file);
  if (!svg) return new Response("ไม่พบ", { status: 404 });
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
