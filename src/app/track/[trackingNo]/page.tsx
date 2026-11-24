import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TrackingDetails } from "@/features/delivery/components/tracking-details";
import { confirmReceiptAction } from "@/features/delivery/receipt-actions";
import { getTrackingView } from "@/features/delivery/server/tracking";
import { getDb } from "@/shared/db";
import { requireAccount } from "@/shared/session";

export const metadata: Metadata = { title: "ติดตามพัสดุ" };

export default async function TrackingPage({ params }: PageProps<"/track/[trackingNo]">) {
  const { trackingNo } = await params;
  const viewer = await requireAccount(`/track/${encodeURIComponent(trackingNo)}`);
  const view = getTrackingView(getDb(), trackingNo, viewer);
  if (!view) notFound();
  return <TrackingDetails view={view} confirmAction={confirmReceiptAction} />;
}
