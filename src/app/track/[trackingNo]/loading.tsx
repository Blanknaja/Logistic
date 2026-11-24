import { LoadingTimeout } from "@/features/browse/components/loading-timeout";
import { LOAD_FAILED, TrackingSkeleton } from "@/features/delivery/components/tracking-skeleton";

export default function Loading() {
  return (
    <LoadingTimeout title={LOAD_FAILED}>
      <TrackingSkeleton />
    </LoadingTimeout>
  );
}
