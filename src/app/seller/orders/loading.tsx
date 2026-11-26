import { OrdersLoading } from "@/features/shop-orders/components/orders-loading";
import { SkeletonExit } from "@/shared/ui/transitions";

export default function Loading() {
  return (
    <SkeletonExit>
      <OrdersLoading />
    </SkeletonExit>
  );
}
