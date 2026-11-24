import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TrackingSearch } from "@/features/delivery/components/tracking-search";
import { searchParcel } from "@/features/delivery/server/tracking";
import { getDb } from "@/shared/db";
import { requireAccount } from "@/shared/session";

export const metadata: Metadata = { title: "ติดตามพัสดุ" };

export default async function TrackSearchPage({ searchParams }: PageProps<"/track">) {
  const viewer = await requireAccount("/track");
  const { no } = await searchParams;
  if (typeof no !== "string") return <TrackingSearch value="" error={null} />;

  const result = searchParcel(getDb(), no, viewer);
  if (result.ok) redirect(`/track/${result.trackingNo}`);
  return <TrackingSearch value={no} error={result.error} />;
}
