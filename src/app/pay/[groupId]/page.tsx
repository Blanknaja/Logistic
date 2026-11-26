import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { expireOverdueOrderGroups } from "@/features/checkout/server/order-groups";
import { PayPageView } from "@/features/payment/components/pay-page";
import { getPaymentProvider } from "@/features/payment/server/config";
import { getPayPage } from "@/features/payment/server/payments";
import { getDb } from "@/shared/db";
import { requireAccount } from "@/shared/session";
import { PageSlide } from "@/shared/ui/transitions";

export const metadata: Metadata = { title: "จ่ายเงิน" };

export default async function PayPage({ params, searchParams }: PageProps<"/pay/[groupId]">) {
  const { groupId } = await params;
  const viewer = await requireAccount(`/pay/${groupId}`);
  const provider = getPaymentProvider();
  const db = getDb();
  // เลยเขตจ่ายแล้วให้เห็น `ยกเลิก` ทันที ไม่รอรอบตรวจ (CHK-008 PAY-013)
  expireOverdueOrderGroups(db);
  const page = getPayPage(db, viewer.id, Number(groupId));
  if (!page) notFound();
  const { method, retry, notice } = await searchParams;

  return (
    <PageSlide>
      <PayPageView
        page={page}
        method={method === "card" || method === "promptpay" ? method : undefined}
        retry={retry === "1"}
        notice={notice === "paid" || notice === "pending" ? notice : undefined}
        simulator={
          provider.kind === "simulator"
            ? {
                mode: provider.mode,
                canSwitchMode: viewer.isAdmin,
                waiting: page.unresolved.filter((p) => p.chargeId && provider.find(p.chargeId)?.status === "pending"),
              }
            : null
        }
      />
    </PageSlide>
  );
}
