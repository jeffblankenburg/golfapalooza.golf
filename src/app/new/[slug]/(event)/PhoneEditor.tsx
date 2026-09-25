"use client";

import { useState } from "react";
import { v2BrowserClient } from "@/lib/v2/supabase-browser";
import { toE164, formatPhone } from "@/lib/v2/phone";
import styles from "@/app/new/new.module.css";

/**
 * Change the account phone number — the SMS-OTP login credential. Two steps:
 * (1) enter the new number → Supabase texts a confirmation code to it
 * (`updateUser({ phone })`); (2) enter the code → `verifyOtp(type:"phone_change")`
 * commits it. The current session stays valid throughout (it's keyed to the user
 * id, not the phone). On success we mirror the verified auth phone into the profile.
 */
export default function PhoneEditor({
  current,
  onChanged,
}: {
  current: string | null;
  onChanged: (phone: string | null) => void;
}) {
  const supabase = v2BrowserClient();
  const [step, setStep] = useState<"idle" | "new" | "code">("idle");
  const [newPhone, setNewPhone] = useState("");
  const [e164, setE164] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const fmt = current ? formatPhone(current) : null;

  function cancel() {
    setStep("idle");
    setErr(null);
    setNewPhone("");
    setCode("");
  }

  async function sendCode() {
    if (busy) return;
    const target = toE164(newPhone);
    if (!target) {
      setErr("Enter a valid mobile number");
      return;
    }
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.updateUser({ phone: target });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setE164(target);
    setStep("code");
  }

  async function verify() {
    if (busy) return;
    const token = code.replace(/\D/g, "");
    if (token.length < 4) {
      setErr("Enter the code from the text");
      return;
    }
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.verifyOtp({ phone: e164, token, type: "phone_change" });
    if (error) {
      setBusy(false);
      setErr(error.message || "That code didn't work");
      return;
    }
    // Mirror the now-verified auth phone into the profile (server reads it authoritatively).
    let synced = e164;
    try {
      const res = await fetch("/api/v2/profile/sync-phone", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.phone) synced = d.phone;
    } catch {
      // best-effort — the auth change already succeeded
    }
    setBusy(false);
    setSaved(true);
    cancel();
    onChanged(synced);
  }

  return (
    <div className={styles.field}>
      <label className={styles.label}>Phone</label>

      {step === "idle" && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <p className={styles.readonlyValue} style={{ margin: 0 }}>
            {fmt ? `${fmt.flag} ${fmt.text}` : "Not set"}
          </p>
          <button type="button" className={styles.fileBtn} onClick={() => setStep("new")}>
            {fmt ? "Change" : "Add"}
          </button>
          {saved && <span className={styles.roundFormHint} style={{ margin: 0 }}>Updated</span>}
        </div>
      )}

      {step === "new" && (
        <>
          <input
            className={styles.input}
            type="tel"
            inputMode="tel"
            placeholder="New mobile number"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            autoFocus
          />
          <p className={styles.roundFormHint} style={{ marginTop: 4 }}>We&apos;ll text a code to confirm it&apos;s yours.</p>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button type="button" className={styles.createBtn} onClick={sendCode} disabled={busy} style={{ opacity: busy ? 0.6 : 1 }}>
              {busy ? "Sending…" : "Send code"}
            </button>
            <button type="button" className={styles.wizBackLink} onClick={cancel}>Cancel</button>
          </div>
        </>
      )}

      {step === "code" && (
        <>
          <input
            className={styles.input}
            inputMode="numeric"
            placeholder="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            autoFocus
          />
          <p className={styles.roundFormHint} style={{ marginTop: 4 }}>Enter the code sent to {formatPhone(e164).text}.</p>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button type="button" className={styles.createBtn} onClick={verify} disabled={busy} style={{ opacity: busy ? 0.6 : 1 }}>
              {busy ? "Verifying…" : "Verify & save"}
            </button>
            <button type="button" className={styles.wizBackLink} onClick={cancel}>Cancel</button>
          </div>
        </>
      )}

      {err && <p className={styles.formError}>{err}</p>}
    </div>
  );
}
