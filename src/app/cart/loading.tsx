import { CartLoading } from "@/features/cart/components/cart-view";
import { SkeletonExit } from "@/shared/ui/transitions";

export default function Loading() {
  return (
    <SkeletonExit>
      <CartLoading />
    </SkeletonExit>
  );
}
