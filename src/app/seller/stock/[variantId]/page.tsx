import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StockHistoryView } from "@/features/stock/components/stock-history";
import { getStockHistory } from "@/features/stock/server/stock";
import { getDb } from "@/shared/db";
import { requireAccount } from "@/shared/session";

export const metadata: Metadata = { title: "ประวัติสต็อก" };

export default async function StockHistoryPage({ params, searchParams }: PageProps<"/seller/stock/[variantId]">) {
  const { variantId } = await params;
  const viewer = await requireAccount(`/seller/stock/${variantId}`);
  const { page } = await searchParams;
  const history = getStockHistory(getDb(), viewer.shopId, Number(variantId), Number(page ?? 1));
  if (!history) notFound();
  return <StockHistoryView history={history} />;
}
