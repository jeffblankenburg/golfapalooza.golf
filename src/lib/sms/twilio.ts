const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";

export interface SendSmsResult {
  ok: boolean;
  sid?: string;
  error?: string;
}

/**
 * Send an SMS via Twilio's REST API.
 *
 * Requires:
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_MESSAGING_SERVICE_SID  (preferred — same one Supabase uses)
 *     -- OR --
 *   TWILIO_FROM_NUMBER            (E.164, e.g. +14155551234)
 *
 * `to` must be E.164 (e.g. +16145551234).
 */
export async function sendSms(to: string, body: string): Promise<SendSmsResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken) {
    return { ok: false, error: "Twilio credentials not configured" };
  }
  if (!messagingServiceSid && !fromNumber) {
    return {
      ok: false,
      error: "Twilio sender not configured (set TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER)",
    };
  }

  const params = new URLSearchParams({ To: to, Body: body });
  if (messagingServiceSid) {
    params.set("MessagingServiceSid", messagingServiceSid);
  } else if (fromNumber) {
    params.set("From", fromNumber);
  }

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const res = await fetch(
    `${TWILIO_API_BASE}/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    }
  );

  const data = (await res.json().catch(() => ({}))) as {
    sid?: string;
    message?: string;
    code?: number;
  };

  if (!res.ok) {
    return {
      ok: false,
      error: data.message || `Twilio error ${res.status}`,
    };
  }

  return { ok: true, sid: data.sid };
}
