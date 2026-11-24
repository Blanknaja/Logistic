"use server";

import { redirect } from "next/navigation";
import {
  CANCEL_REFUSED,
  cancelOrderGroup,
  listBuyerOrders,
  parseOrderStatus,
  type BuyerOrderPage,
  type OrderCursor,
} from "@/features/checkout/server/buyer-orders";
import { checkOrderGroupPayable } from "@/features/checkout/server/order-groups";
import { getDb } from "@/shared/db";
import { requireAccount } from "@/shared/session";

export async function loadMoreOrdersAction(status: unknown, after: OrderCursor): Promise<BuyerOrderPage> {
  const viewer = await requireAccount("/orders");
  if (typeof after?.orderedAt !== "string" || !Number.isInteger(after?.id)) return { orders: [], next: null };
  return listBuyerOrders(getDb(), viewer.id, { status: parseOrderStatus(status), after });
}

export async function cancelOrderAction(formData: FormData): Promise<{ error: string | null }> {
  const orderNo = String(formData.get("orderNo") ?? "");
  const orderPath = `/orders/${encodeURIComponent(orderNo)}`;
  const viewer = await requireAccount(orderPath);
  const result = cancelOrderGroup(getDb(), { buyerAccountId: viewer.id, orderNo });
  if (result.ok) redirect(orderPath);
  if (result.reason === "paymentPending") return { error: CANCEL_REFUSED.paymentPending };
  // สถานะเปลี่ยนไปแล้ว โหลดหน้าใหม่ให้เห็นสถานะจริงพร้อมเหตุผลที่ยกเลิกไม่ได้
  redirect(`${orderPath}?notice=${result.reason}`);
}

/** ปุ่ม "จ่ายเงิน" ตรวจเวลาก่อนพาไปหน้าจ่ายเงิน เลยเขตแล้วโหลดหน้าคำสั่งซื้อใหม่พร้อมข้อความหมดเวลา (CHK-008) */
export async function goToPaymentAction(formData: FormData): Promise<void> {
  const orderPath = `/orders/${encodeURIComponent(String(formData.get("orderNo") ?? ""))}`;
  const groupId = Number(formData.get("groupId"));
  const viewer = await requireAccount(orderPath);
  const check = checkOrderGroupPayable(getDb(), groupId, viewer.id);
  if (!check.payable && check.reason === "expired") redirect(`${orderPath}?notice=expired`);
  redirect(`/pay/${groupId}`);
}
