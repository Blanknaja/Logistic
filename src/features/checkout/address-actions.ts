"use server";

import { redirect } from "next/navigation";
import { loginPath, safeNextPath } from "@/features/account/server/login-path";
import {
  createAddress,
  deleteAddress,
  setDefaultAddress,
  updateAddress,
  type AddressErrors,
} from "@/features/checkout/server/addresses";
import { getDb } from "@/shared/db";
import { getCurrentAccount } from "@/shared/session";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

async function viewerId(back: string): Promise<number> {
  const viewer = await getCurrentAccount();
  // ฟอร์มค้างอยู่ในแท็บที่ออกจากระบบไปแล้ว
  if (!viewer) redirect(loginPath(back, "relogin"));
  return viewer.id;
}

/** กลับไปหน้าที่ส่งมาทาง next พร้อมเลขที่อยู่ที่เพิ่งบันทึก หน้าสั่งซื้อจะเลือกที่อยู่นั้นไว้ให้ */
function backTo(next: string, addressId: number): string {
  const url = new URL(next, "http://localhost");
  url.searchParams.set("addressId", String(addressId));
  return url.pathname + url.search;
}

/** CHK-002 บันทึกที่อยู่ใหม่ หรือแก้ที่อยู่เดิมเมื่อมี addressId */
export async function saveAddressAction(formData: FormData): Promise<{ errors: AddressErrors }> {
  const addressId = text(formData, "addressId");
  const next = text(formData, "next") ? safeNextPath(text(formData, "next")) : null;
  const page = `/addresses/${addressId || "new"}${next ? `?${new URLSearchParams({ next })}` : ""}`;
  const accountId = await viewerId(page);

  const input = {
    recipientName: text(formData, "recipientName"),
    phone: text(formData, "phone"),
    address: text(formData, "address"),
    subdistrict: text(formData, "subdistrict"),
    district: text(formData, "district"),
    province: text(formData, "province"),
    postcode: text(formData, "postcode"),
  };
  const result = addressId
    ? updateAddress(getDb(), accountId, Number(addressId), input)
    : createAddress(getDb(), accountId, input);
  if (!result.ok) return { errors: result.errors };
  redirect(next ? backTo(next, result.id) : "/addresses?notice=saved");
}

/** CHK-003 */
export async function setDefaultAddressAction(formData: FormData): Promise<void> {
  const accountId = await viewerId("/addresses");
  const done = setDefaultAddress(getDb(), accountId, Number(text(formData, "addressId")));
  redirect(done ? "/addresses" : "/addresses?notice=gone");
}

/** CHK-003 */
export async function deleteAddressAction(formData: FormData): Promise<void> {
  const accountId = await viewerId("/addresses");
  const done = deleteAddress(getDb(), accountId, Number(text(formData, "addressId")));
  redirect(done ? "/addresses?notice=deleted" : "/addresses?notice=gone");
}
