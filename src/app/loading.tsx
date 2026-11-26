import { LoadingState } from "@/shared/ui/states";
import { SkeletonExit } from "@/shared/ui/transitions";

export default function Loading() {
  return (
    <SkeletonExit>
      <LoadingState />
    </SkeletonExit>
  );
}
