"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { logIn, signUp, updateProfile, type ProfileErrors, type SignUpErrors } from "@/features/account/server/accounts";
import { loginPath, safeNextPath } from "@/features/account/server/login-path";
import { endSession } from "@/features/account/server/sessions";
import { getDb } from "@/shared/db";
import { getCurrentAccount, SESSION_COOKIE } from "@/shared/session";

// เบราว์เซอร์เก็บ cookie ได้นานสุดราว 400 วัน อายุจริงของการเข้าสู่ระบบนับที่ฐานข้อมูล (ACC-006)
// cookie ที่ค้างหลังหมดอายุทำให้หน้าเข้าสู่ระบบรู้ว่าต้องบอก "กรุณาเข้าสู่ระบบอีกครั้ง"
const COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

async function startSession(token: string): Promise<void> {
  const secure = (await headers()).get("x-forwarded-proto") === "https";
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

export async function signUpAction(formData: FormData): Promise<{ errors: SignUpErrors }> {
  if (await getCurrentAccount()) redirect("/");
  const result = await signUp(getDb(), {
    email: text(formData, "email"),
    password: text(formData, "password"),
    displayName: text(formData, "displayName"),
  });
  if (!result.ok) return { errors: result.errors };
  await startSession(result.token);
  redirect("/");
}

export async function logInAction(formData: FormData): Promise<{ error: string | null }> {
  const next = safeNextPath(formData.get("next"));
  if (await getCurrentAccount()) redirect(next);
  const result = await logIn(getDb(), { email: text(formData, "email"), password: text(formData, "password") });
  if (!result.ok) return { error: result.error };
  await startSession(result.token);
  redirect(next);
}

export async function logOutAction(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) endSession(getDb(), token);
  store.delete(SESSION_COOKIE);
  redirect("/");
}

export async function saveProfileAction(formData: FormData): Promise<{ errors: ProfileErrors }> {
  const viewer = await getCurrentAccount();
  // ฟอร์มค้างอยู่ในแท็บที่ออกจากระบบไปแล้ว (ACC-007)
  if (!viewer) redirect(loginPath("/profile", "relogin"));
  const result = updateProfile(getDb(), viewer.id, {
    displayName: text(formData, "displayName"),
    phone: text(formData, "phone"),
  });
  if (!result.ok) return { errors: result.errors };
  // ชื่อใหม่ต้องขึ้นที่แถบด้านบนด้วย ซึ่งอยู่ใน layout
  revalidatePath("/", "layout");
  redirect("/profile?saved=1");
}
