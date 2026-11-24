import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StockListView } from "@/features/stock/components/stock-list";
import { listStock, parseStockFilter } from "@/features/stock/server/stock";
import { getDb } from "@/shared/db";
import { requireAccount } from "@/shared/session";

export const metadata: Metadata = { title: "สต็อก" };

export default async function StockPage({ searchParams }: PageProps<"/seller/stock">) {
  const viewer = await requireAccount("/seller/stock");
  if (viewer.shopId === null) notFound();
  const { filter: rawFilter, page } = await searchParams;
  const filter = parseStockFilter(rawFilter);
  const list = listStock(getDb(), viewer.shopId, { filter, page: Number(page ?? 1) });
  return <StockListView list={list} filter={filter} />;
}
