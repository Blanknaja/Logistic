"use server";

import { redirect } from "next/navigation";
import type { CardErrors } from "@/features/payment/server/card";
import { getPaymentProvider } from "@/features/payment/server/config";
import {
  changePaymentMethod,
  checkPaymentStatus,
  getPayPage,
  minutesLeftText,
  payByCard,
  payByPromptPay,
  syncGroupPayments,
  UNAVAILABLE_MESSAGE,
  type PayResult,
} from "@/features/payment/server/payments";
import type { Simulator, SimulatorMode } from "@/features/payment/server/simulator";
import { getDb } from "@/shared/db";
import { formatDateTime } from "@/shared/format";
import { requireAccount } from "@/shared/session";

export type PayFormState = { errors?: CardErrors; message?: string; retry?: boolean };

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

async function buyerAndGroup(formData: FormData) {
  const groupId = Number(text(formData, "groupId"));
  const viewer = await requireAccount(`/pay/${groupId}`);
  return { buyerId: viewer.id, groupId };
}

function afterPay(groupId: number, result: PayResult): PayFormState {
  if (result.kind === "invalid") return { errors: result.errors };
  if (result.kind === "unavailable") return { message: `${UNAVAILABLE_MESSAGE} ${minutesLeftText(result.minutesLeft)}`, retry: true };
  if (result.kind === "already-paid") redirect(`/pay/${groupId}?notice=paid`);
  if (result.kind === "pending-exists") redirect(`/pay/${groupId}?notice=pending`);
  redirect(`/pay/${groupId}`);
}

export async function payByCardAction(formData: FormData): Promise<PayFormState> {
  const { buyerId, groupId } = await buyerAndGroup(formData);
  const card = {
    number: text(formData, "number"),
    name: text(formData, "name"),
    expiry: text(formData, "expiry"),
    securityCode: text(formData, "securityCode"),
  };
  return afterPay(groupId, await payByCard(getDb(), getPaymentProvider(), { buyerId, groupId, card }));
}

export async function payByPromptPayAction(formData: FormData): Promise<PayFormState> {
  const { buyerId, groupId } = await buyerAndGroup(formData);
  return afterPay(groupId, await payByPromptPay(getDb(), getPaymentProvider(), { buyerId, groupId }));
}

export async function checkStatusAction(formData: FormData): Promise<PayFormState> {
  const { buyerId, groupId } = await buyerAndGroup(formData);
  const result = await checkPaymentStatus(getDb(), getPaymentProvider(), { buyerId, groupId });
  if (result.kind === "error") return { message: "เช็คสถานะไม่ได้ตอนนี้ กรุณาลองใหม่" };
  if (result.kind === "still-pending") return { message: `ยังไม่ได้รับเงิน เช็คล่าสุด ${formatDateTime(result.checkedAt)}` };
  redirect(`/pay/${groupId}`);
}

export async function changeMethodAction(formData: FormData): Promise<void> {
  const { buyerId, groupId } = await buyerAndGroup(formData);
  changePaymentMethod(getDb(), { buyerId, groupId });
  redirect(`/pay/${groupId}`);
}

/** หน้าที่เปิดค้างเรียกเป็นระยะ แล้วโหลดหน้าใหม่เองเพื่อแสดงผลล่าสุด */
export async function pollPaymentAction(groupId: number): Promise<void> {
  const viewer = await requireAccount(`/pay/${groupId}`);
  await syncGroupPayments(getDb(), getPaymentProvider(), { buyerId: viewer.id, groupId: Number(groupId) });
}

// ปุ่มของตัวจำลอง ใช้ได้เฉพาะตอนที่ยังไม่ได้ใส่กุญแจของ Omise ---------------------

function simulator(): Simulator {
  const provider = getPaymentProvider();
  if (provider.kind !== "simulator") throw new Error("ตัวจำลองใช้ได้เฉพาะตอนที่ยังไม่ได้ใส่กุญแจของ Omise");
  return provider;
}

export async function setSimulatorModeAction(formData: FormData): Promise<void> {
  const { groupId } = await buyerAndGroup(formData);
  const mode = text(formData, "mode");
  if (mode === "normal" || mode === "no-answer" || mode === "unavailable") simulator().mode = mode satisfies SimulatorMode;
  redirect(`/pay/${groupId}`);
}

/** แทนการกดทำเครื่องหมายผลในหน้าจัดการของ Omise ระบบรู้ผลตอนหน้าถามผลรอบถัดไป หรือตอนกดเช็คสถานะ */
export async function markSimulatorChargeAction(formData: FormData): Promise<void> {
  const { buyerId, groupId } = await buyerAndGroup(formData);
  const result = text(formData, "result");
  const chargeId = text(formData, "chargeId");
  const own = getPayPage(getDb(), buyerId, groupId)?.unresolved.some((payment) => payment.chargeId === chargeId);
  if (own && (result === "successful" || result === "failed")) simulator().mark(chargeId, result);
  redirect(`/pay/${groupId}`);
}
