/**
 * Direct Twilio SMS for v2 (invite links, etc.). Reuses the shared Twilio
 * credentials — this is infrastructure, not legacy code (no legacy import).
 * Login/OTP texts still go through Supabase→Twilio; this is only for custom
 * app-authored messages. Env-guarded: no-ops (returns not_configured) if unset.
 */

const SID = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;
const FROM = process.env.TWILIO_FROM_NUMBER;
// Preferred sender: a Messaging Service carries the A2P 10DLC campaign
// registration US carriers require for app-to-person SMS. When set, Twilio picks
// the sending number from the service's pool and the From number is ignored.
const MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID;

export function smsConfigured(): boolean {
  return !!(SID && TOKEN && (MESSAGING_SERVICE_SID || FROM));
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
      body: new URLSearchParams({
        To: to,
        Body: body,
        // Prefer the Messaging Service (A2P campaign sender); fall back to a raw From.
        ...(MESSAGING_SERVICE_SID ? { MessagingServiceSid: MESSAGING_SERVICE_SID } : { From: FROM! }),
      }).toString(),
    }
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: (data as { message?: string }).message || "sms_failed" };
  }
  return { ok: true };
}
