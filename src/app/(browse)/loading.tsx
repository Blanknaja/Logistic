import { LoadingTimeout } from "@/features/browse/components/loading-timeout";
import { ResultsSkeleton } from "@/features/browse/components/skeletons";

export default function Loading() {
  return (
    <LoadingTimeout>
      <ResultsSkeleton />
    </LoadingTimeout>
  );
}
