import { redirect } from "next/navigation";
import { BrowseResults } from "@/features/browse/components/browse-results";
import { parseBrowseParams } from "@/features/browse/search-params";
import { readSentence } from "@/features/browse/sentence";
import { searchProducts } from "@/features/browse/server/search";
import { parseTrackingNo } from "@/features/delivery/server/tracking";
import { listCategories } from "@/features/product-listing/server/categories";
import { getDb } from "@/shared/db";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const params = parseBrowseParams(await searchParams);
  const db = getDb();
  const categories = listCategories(db);

  // เลขติดตามพัสดุในช่องค้นหาสินค้า พาไปหน้าติดตามพัสดุ (SNT-010)
  const trackingNo = parseTrackingNo(params.q);
  if (trackingNo) redirect(`/track?no=${trackingNo}`);

  // ค่าที่อ่านได้จากประโยคแทนที่คำค้นและตัวกรองเดิม ลิงก์ทุกอันในหน้าจึงใช้ค่าที่แยกแล้ว เหมือนผู้ซื้อเลือกตัวกรองเอง (SNT-008)
  const sentence = readSentence(params.q, categories);
  const understood = sentence ? { ...params, ...sentence } : params;

  return <BrowseResults params={understood} result={searchProducts(db, understood)} categories={categories} />;
}
