import { LoadingTimeout } from "@/features/browse/components/loading-timeout";
import { ProductDetailSkeleton } from "@/features/browse/components/skeletons";

export default function Loading() {
  return (
    <LoadingTimeout>
      <ProductDetailSkeleton />
    </LoadingTimeout>
  );
}
