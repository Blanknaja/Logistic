import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StatusChangeLinks } from "@/features/delivery/components/status-change-links";
import { TrackingDetails } from "@/features/delivery/components/tracking-details";
import { confirmReceiptAction } from "@/features/delivery/receipt-actions";
import { getParcelForStatusChange } from "@/features/delivery/server/parcel-status";
import { getTrackingView } from "@/features/delivery/server/tracking";
import { getDb } from "@/shared/db";
import { requireAccount } from "@/shared/session";

export const metadata: Metadata = { title: "ติดตามพัสดุ" };

export default async function TrackingPage({ params }: PageProps<"/track/[trackingNo]">) {
  const { trackingNo } = await params;
  const viewer = await requireAccount(`/track/${encodeURIComponent(trackingNo)}`);
  const view = getTrackingView(getDb(), trackingNo, viewer);
  if (!view) notFound();
  const statusChange = view.canChangeStatus ? getParcelForStatusChange(getDb(), view.trackingNo, viewer) : null;

  return (
    <TrackingDetails
      view={view}
      confirmAction={confirmReceiptAction}
      statusControls={
        statusChange && <StatusChangeLinks trackingNo={view.trackingNo} nextStatuses={statusChange.nextStatuses} />
      }
    />
  );
}
