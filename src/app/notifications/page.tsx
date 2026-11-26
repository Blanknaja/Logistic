import type { Metadata } from "next";
import { NotificationsView } from "@/features/notification/components/notifications-view";
import { listNotifications } from "@/features/notification/server/notifications";
import { getDb } from "@/shared/db";
import { requireAccount } from "@/shared/session";

export const metadata: Metadata = { title: "แจ้งเตือน" };

export default async function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  const viewer = await requireAccount("/notifications");
  const { page } = await searchParams;
  return <NotificationsView list={listNotifications(getDb(), viewer.id, Number(page ?? 1))} />;
}
