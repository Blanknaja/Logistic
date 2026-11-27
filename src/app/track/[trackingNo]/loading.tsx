import { LoadingTimeout } from "@/shared/ui/loading-timeout";
import { LOAD_FAILED, TrackingSkeleton } from "@/features/delivery/components/tracking-skeleton";
import { SkeletonExit } from "@/shared/ui/transitions";

export default function Loading() {
  return (
    <SkeletonExit>
      <LoadingTimeout title={LOAD_FAILED}>
        <TrackingSkeleton />
      </LoadingTimeout>
    </SkeletonExit>
  );
}
