import { FormLoading } from "@/features/product-listing/components/form-loading";
import { SkeletonExit } from "@/shared/ui/transitions";

export default function Loading() {
  return (
    <SkeletonExit>
      <FormLoading />
    </SkeletonExit>
  );
}
