import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StockHistoryView } from "@/features/stock/components/stock-history";
import { getStockHistory } from "@/features/stock/server/stock";
import { getDb } from "@/shared/db";
import { requireShop } from "@/features/shop/require-shop";
import { PageReveal } from "@/shared/ui/transitions";

export const metadata: Metadata = { title: "ประวัติสต็อก" };

export default async function StockHistoryPage({ params, searchParams }: PageProps<"/seller/stock/[variantId]">) {
  const { variantId } = await params;
  const viewer = await requireShop(`/seller/stock/${variantId}`);
  const { page } = await searchParams;
  const history = getStockHistory(getDb(), viewer.shopId, Number(variantId), Number(page ?? 1));
  if (!history) notFound();
  return (
    <PageReveal>
      <StockHistoryView history={history} />
    </PageReveal>
  );
}
