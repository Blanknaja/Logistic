import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PayPageView } from "@/features/payment/components/pay-page";
import { getPaymentProvider } from "@/features/payment/server/config";
import { getPayPage } from "@/features/payment/server/payments";
import { getDb } from "@/shared/db";
import { requireAccount } from "@/shared/session";

export const metadata: Metadata = { title: "จ่ายเงิน" };

export default async function PayPage({ params, searchParams }: PageProps<"/pay/[groupId]">) {
  const { groupId } = await params;
  const viewer = await requireAccount(`/pay/${groupId}`);
  const provider = getPaymentProvider();
  const page = getPayPage(getDb(), viewer.id, Number(groupId));
  if (!page) notFound();
  const { method, retry, notice } = await searchParams;

  return (
    <PayPageView
      page={page}
      method={method === "card" || method === "promptpay" ? method : undefined}
      retry={retry === "1"}
      notice={notice === "paid" || notice === "pending" ? notice : undefined}
      simulator={
        provider.kind === "simulator"
          ? { mode: provider.mode, waiting: page.unresolved.filter((p) => p.chargeId && provider.find(p.chargeId)?.status === "pending") }
          : null
      }
    />
  );
}
