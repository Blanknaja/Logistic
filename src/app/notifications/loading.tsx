import { NOTIFICATIONS_LOAD_FAILED } from "@/features/notification/server/notifications";
import { LoadingTimeout } from "@/shared/ui/loading-timeout";
import { LoadingState } from "@/shared/ui/states";

export default function Loading() {
  return (
    <LoadingTimeout title={NOTIFICATIONS_LOAD_FAILED}>
      <LoadingState title="กำลังโหลดแจ้งเตือน" />
    </LoadingTimeout>
  );
}
