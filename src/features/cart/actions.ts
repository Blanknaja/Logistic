"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { loginPath } from "@/features/account/server/login-path";
import type { AddToCartInput, AddToCartResult } from "@/features/browse/add-to-cart";
import {
  addToCart,
  changeQuantity,
  confirmCheckout,
  removeCartItem,
  setCartSelection,
  variantProductId,
  type ShownItem,
} from "@/features/cart/server/cart";
import { getDb } from "@/shared/db";
import { getCurrentAccount, type CurrentAccount } from "@/shared/session";

export type CartActionResult = { message: string | null };

const isId = (value: unknown): value is number => Number.isSafeInteger(value);

async function cartOwner(): Promise<CurrentAccount> {
  const viewer = await getCurrentAccount();
  // หน้าตะกร้าค้างอยู่ในแท็บที่ออกจากระบบไปแล้ว
  if (!viewer) redirect(loginPath("/cart", "relogin"));
  return viewer;
}

/** ส่งให้ AddToCartForm ในหน้ารายละเอียดสินค้า (CRT-001 ถึง CRT-005) */
export async function addToCartAction(input: AddToCartInput): Promise<AddToCartResult> {
  const db = getDb();
  const variantId = Number(input?.variantId);
  const viewer = await getCurrentAccount();
  if (!viewer) {
    const productId = isId(variantId) ? variantProductId(db, variantId) : null;
    redirect(loginPath(productId ? `/products/${productId}` : "/"));
  }
  const result = addToCart(db, viewer.id, { variantId, quantity: String(input?.quantity ?? "") });
  // ไอคอนตะกร้าที่แถบด้านบนต้องนับรายการใหม่
  if (result.ok) refresh();
  return result;
}

export async function changeQuantityAction(itemId: number, quantity: string): Promise<CartActionResult> {
  const viewer = await cartOwner();
  if (!isId(itemId)) return { message: null };
  const result = changeQuantity(getDb(), viewer.id, itemId, String(quantity));
  refresh();
  return { message: result.message };
}

export async function removeItemAction(itemId: number): Promise<CartActionResult> {
  const viewer = await cartOwner();
  if (isId(itemId)) removeCartItem(getDb(), viewer.id, itemId);
  refresh();
  return { message: null };
}

export async function selectItemsAction(itemIds: number[], selected: boolean): Promise<CartActionResult> {
  const viewer = await cartOwner();
  const ids = Array.isArray(itemIds) ? itemIds.filter(isId) : [];
  setCartSelection(getDb(), viewer.id, ids, selected === true);
  refresh();
  return { message: null };
}

/** ปุ่ม "สั่งซื้อ" ผ่านการตรวจแล้วไปหน้าสั่งซื้อ ซึ่งอ่านรายการที่เลือกจากตะกร้าเอง (CRT-015) */
export async function checkoutAction(shown: ShownItem[]): Promise<CartActionResult> {
  const viewer = await cartOwner();
  const items = Array.isArray(shown)
    ? shown.filter((s) => isId(s?.itemId) && isId(s?.price) && isId(s?.quantity))
    : [];
  const result = confirmCheckout(getDb(), viewer.id, items);
  if (result.ok) redirect("/checkout");
  refresh();
  return { message: result.message };
}
