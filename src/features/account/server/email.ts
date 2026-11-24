export type EmailMessage = { to: string; subject: string; text: string };

const SEND_TIMEOUT_MS = 10_000;

/**
 * ส่งอีเมลผ่าน Resend (แผนฟรี) เมื่อตั้งค่า RESEND_API_KEY และ EMAIL_FROM ไว้
 * ถ้ายังไม่ได้ตั้ง เขียนอีเมลลงบันทึกของเซิร์ฟเวอร์แทน แอปจึงใช้ได้โดยไม่มีระบบส่งอีเมล
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    console.info(`[อีเมล] ถึง ${message.to} เรื่อง ${message.subject}\n${message.text}`);
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, ...message }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`ส่งอีเมลถึง ${message.to} ไม่สำเร็จ: ${response.status} ${await response.text()}`);
}
