import { StorefrontSkeleton } from "@/features/shop/components/skeletons";
import { SkeletonExit } from "@/shared/ui/transitions";

export default function Loading() {
  return (
    <SkeletonExit>
      <StorefrontSkeleton />
    </SkeletonExit>
  );
}
