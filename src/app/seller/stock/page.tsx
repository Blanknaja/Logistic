import type { Metadata } from "next";
import { StockListView } from "@/features/stock/components/stock-list";
import { listStock, parseStockFilter } from "@/features/stock/server/stock";
import { getDb } from "@/shared/db";
import { requireShop } from "@/features/shop/require-shop";

export const metadata: Metadata = { title: "สต็อก" };

export default async function StockPage({ searchParams }: PageProps<"/seller/stock">) {
  const viewer = await requireShop("/seller/stock");
  const { filter: rawFilter, page } = await searchParams;
  const filter = parseStockFilter(rawFilter);
  const list = listStock(getDb(), viewer.shopId, { filter, page: Number(page ?? 1) });
  return <StockListView list={list} filter={filter} />;
}
