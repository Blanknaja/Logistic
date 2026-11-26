"use client";

import { useEffect } from "react";
import { NOTIFICATIONS_LOAD_FAILED } from "@/features/notification/server/notifications";
import { RetryButton } from "@/shared/ui/retry-button";
import { ErrorState } from "@/shared/ui/states";

export default function NotificationsError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorState title={NOTIFICATIONS_LOAD_FAILED} action={<RetryButton onRetry={retry} />} />;
}
