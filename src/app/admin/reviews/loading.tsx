import { ReviewsLoading } from "@/features/review/components/reviews-loading";
import { SkeletonExit } from "@/shared/ui/transitions";

export default function Loading() {
  return (
    <SkeletonExit>
      <ReviewsLoading />
    </SkeletonExit>
  );
}
