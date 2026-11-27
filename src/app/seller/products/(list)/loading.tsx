import { ListLoading } from "@/features/product-listing/components/list-loading";
import { SkeletonExit } from "@/shared/ui/transitions";

export default function Loading() {
  return (
    <SkeletonExit>
      <ListLoading />
    </SkeletonExit>
  );
}
