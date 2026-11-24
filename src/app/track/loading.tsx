import { LoadingTimeout } from "@/features/browse/components/loading-timeout";
import { LOAD_FAILED } from "@/features/delivery/components/tracking-skeleton";
import { LoadingState } from "@/shared/ui/states";

export default function Loading() {
  return (
    <LoadingTimeout title={LOAD_FAILED}>
      <LoadingState />
    </LoadingTimeout>
  );
}
