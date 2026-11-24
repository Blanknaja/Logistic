import { BrowseResults } from "@/features/browse/components/browse-results";
import { parseBrowseParams } from "@/features/browse/search-params";
import { searchProducts } from "@/features/browse/server/search";
import { listCategories } from "@/features/product-listing/server/categories";
import { getDb } from "@/shared/db";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const params = parseBrowseParams(await searchParams);
  const db = getDb();
  return <BrowseResults params={params} result={searchProducts(db, params)} categories={listCategories(db)} />;
}
