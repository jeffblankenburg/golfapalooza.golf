/**
 * Direct Twilio SMS for v2 (invite links, etc.). Reuses the shared Twilio
 * credentials — this is infrastructure, not legacy code (no legacy import).
 * Login/OTP texts still go through Supabase→Twilio; this is only for custom
 * app-authored messages. Env-guarded: no-ops (returns not_configured) if unset.
 */

const SID = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;
const FROM = process.env.TWILIO_FROM_NUMBER;

export function smsConfigured(): boolean {
  return !!(SID && TOKEN && FROM);
}

export async function sendSms(
  to: string,
  body: string
): Promise<{ ok: boolean; error?: string }> {
  if (!smsConfigured()) return { ok: false, error: "not_configured" };
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${SID}:${TOKEN}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: FROM!, Body: body }).toString(),
    }
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: (data as { message?: string }).message || "sms_failed" };
  }
  return { ok: true };
}
