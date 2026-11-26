import { ShopFormSkeleton } from "@/features/shop/components/skeletons";
import { SkeletonExit } from "@/shared/ui/transitions";

export default function Loading() {
  return (
    <SkeletonExit>
      <ShopFormSkeleton submitLabel="บันทึก" />
    </SkeletonExit>
  );
}
