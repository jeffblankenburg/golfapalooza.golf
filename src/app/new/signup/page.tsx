"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { v2BrowserClient } from "@/lib/v2/supabase-browser";
import styles from "../new.module.css";

type Step = "phone" | "code" | "name";

// Best-effort E.164 for US numbers; a leading + is passed through as-is.
function toE164(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) {
    const d = "+" + trimmed.slice(1).replace(/\D/g, "");
    return d.length >= 11 ? d : null;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export default function SignupPage() {
  const router = useRouter();
  const supabase = v2BrowserClient();

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If already signed in, skip ahead: to name if there's no profile yet, else in.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data: profile } = await supabase
        .from("v2_profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (profile) router.replace("/new");
      else setStep("name");
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, router]);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const e164 = toE164(phone);
    if (!e164) {
      setError("Enter a valid mobile number");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({ phone: e164 });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setPhone(e164);
    setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const token = code.replace(/\D/g, "");
    if (token.length < 4) {
      setError("Enter the code from the text");
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: "sms",
    });
    if (err || !data.user) {
      setBusy(false);
      setError(err?.message || "That code didn't work");
      return;
    }
    // Existing profile → straight in; otherwise collect a name.
    const { data: profile } = await supabase
      .from("v2_profiles")
      .select("id")
      .eq("id", data.user.id)
      .maybeSingle();
    setBusy(false);
    if (profile) router.replace("/new");
    else setStep("name");
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setBusy(false);
      setStep("phone");
      return;
    }
    const { error: err } = await supabase.from("v2_profiles").upsert(
      { id: user.id, display_name: name.trim(), phone: user.phone ?? null },
      { onConflict: "id" }
    );
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.replace("/new");
  }

  return (
    <div className={styles.page}>
      <p className={styles.eyebrow}>
        {step === "name" ? "Almost there" : "Welcome"}
      </p>
      <h1 className={styles.title}>
        {step === "phone" && "Sign in"}
        {step === "code" && "Enter code"}
        {step === "name" && "Your name"}
      </h1>
      <p className={styles.lede}>
        {step === "phone" &&
          "We'll text you a one-time code. New here? This creates your account."}
        {step === "code" && `Sent to ${phone}.`}
        {step === "name" && "How your name shows to your groups."}
      </p>

      {step === "phone" && (
        <form className={styles.form} onSubmit={sendCode}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="phone">
              Mobile number
            </label>
            <input
              id="phone"
              className={styles.input}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 123-4567"
              autoFocus
            />
          </div>
          {error && <p className={styles.formError}>{error}</p>}
          <button type="submit" className={styles.createBtn} disabled={busy}>
            {busy ? "Sending…" : "Send code"}
          </button>
        </form>
      )}

      {step === "code" && (
        <form className={styles.form} onSubmit={verify}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="code">
              6-digit code
            </label>
            <input
              id="code"
              className={styles.input}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="••••••"
              maxLength={6}
              autoFocus
            />
          </div>
          {error && <p className={styles.formError}>{error}</p>}
          <button type="submit" className={styles.createBtn} disabled={busy}>
            {busy ? "Verifying…" : "Verify"}
          </button>
          <button
            type="button"
            className={styles.cancel}
            onClick={() => {
              setCode("");
              setError(null);
              setStep("phone");
            }}
          >
            Use a different number
          </button>
        </form>
      )}

      {step === "name" && (
        <form className={styles.form} onSubmit={saveName}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="name">
              Display name
            </label>
            <input
              id="name"
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Randy Watson"
              maxLength={60}
              autoFocus
            />
          </div>
          {error && <p className={styles.formError}>{error}</p>}
          <button
            type="submit"
            className={styles.createBtn}
            disabled={busy || !name.trim()}
          >
            {busy ? "Saving…" : "Continue"}
          </button>
        </form>
      )}
    </div>
  );
}
