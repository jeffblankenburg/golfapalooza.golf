"use client";

import { use, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { v2BrowserClient } from "@/lib/v2/supabase-browser";
import { toE164 } from "@/lib/v2/phone";
import styles from "../../new.module.css";

type Step = "loading" | "invalid" | "phone" | "code" | "details" | "working";

export default function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();
  const supabase = v2BrowserClient();

  const [step, setStep] = useState<Step>("loading");
  const [orgName, setOrgName] = useState("");
  const [orgLogo, setOrgLogo] = useState<string | null>(null);
  const [invalidReason, setInvalidReason] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Profile fields (prefilled from the invite when the inviter added them).
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nickname, setNickname] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [zip, setZip] = useState("");

  const accept = useCallback(
    async (withFields: boolean) => {
      setStep("working");
      setError(null);
      const bodyObj = withFields
        ? {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            nickname: nickname.trim() || null,
            birthdate: birthdate || null,
            zip: zip.trim() || null,
          }
        : {};
      const res = await fetch(`/api/v2/invites/${code}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyObj),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        router.replace(data.slug ? `/new/${data.slug}` : "/new");
        return;
      }
      if (data.error === "name_required") {
        setStep("details");
        return;
      }
      setError(data.error || "Could not join");
      setStep("phone");
    },
    [code, router, firstName, lastName, nickname, birthdate, zip]
  );

  const proceedSignedIn = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    const { data: profile } = await supabase
      .from("v2_profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    if (profile) accept(false);
    else setStep("details");
    return true;
  }, [supabase, accept]);

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetch(`/api/v2/invites/${code}`);
      const data = await res.json().catch(() => ({}));
      if (!active) return;
      if (!data.valid) {
        setInvalidReason(data.reason || "not_found");
        setStep("invalid");
        return;
      }
      setOrgName(data.orgName || "this group");
      setOrgLogo(data.orgLogo || null);
      const pf = data.prefill || {};
      if (pf.first_name) setFirstName(pf.first_name);
      if (pf.last_name) setLastName(pf.last_name);
      if (pf.nickname) setNickname(pf.nickname);
      if (pf.birthdate) setBirthdate(pf.birthdate);
      if (pf.zip) setZip(pf.zip);
      if (await proceedSignedIn()) return;
      if (active) setStep("phone");
    })();
    return () => {
      active = false;
    };
  }, [code, proceedSignedIn]);

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
    const token = otp.replace(/\D/g, "");
    if (token.length < 4) {
      setError("Enter the code from the text");
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
    setBusy(false);
    if (err || !data.user) {
      setError(err?.message || "That code didn't work");
      return;
    }
    const { data: profile } = await supabase
      .from("v2_profiles")
      .select("id")
      .eq("id", data.user.id)
      .maybeSingle();
    if (profile) accept(false);
    else setStep("details");
  }

  function saveDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      setError("First and last name are required");
      return;
    }
    accept(true);
  }

  return (
    <div className={styles.page}>
      {orgLogo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={orgLogo} alt={orgName} className={styles.signupBrandLogo} />
      )}
      {step === "loading" && <p className={styles.lede}>Checking your invite…</p>}

      {step === "invalid" && (
        <>
          <p className={styles.eyebrow}>Invite</p>
          <h1 className={styles.title}>
            {invalidReason === "expired"
              ? "Invite expired"
              : invalidReason === "used"
              ? "Invite already used"
              : "Invite not found"}
          </h1>
          <p className={styles.lede}>Ask the group organizer to send you a new one.</p>
        </>
      )}

      {step === "working" && <p className={styles.lede}>Joining {orgName}…</p>}

      {step === "phone" && (
        <>
          <p className={styles.eyebrow}>You&apos;re invited</p>
          <h1 className={styles.title}>Join {orgName}</h1>
          <p className={styles.lede}>
            Verify the mobile number this invite was sent to and you&apos;re in.
          </p>
          <form className={styles.form} onSubmit={sendCode}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="phone">Mobile number</label>
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
        </>
      )}

      {step === "code" && (
        <>
          <p className={styles.eyebrow}>You&apos;re invited</p>
          <h1 className={styles.title}>Enter code</h1>
          <p className={styles.lede}>Sent to {phone}.</p>
          <form className={styles.form} onSubmit={verify}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="otp">6-digit code</label>
              <input
                id="otp"
                className={styles.input}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="••••••"
                maxLength={6}
                autoFocus
              />
            </div>
            {error && <p className={styles.formError}>{error}</p>}
            <button type="submit" className={styles.createBtn} disabled={busy}>
              {busy ? "Verifying…" : "Verify"}
            </button>
          </form>
        </>
      )}

      {step === "details" && (
        <>
          <p className={styles.eyebrow}>Almost there</p>
          <h1 className={styles.title}>Your details</h1>
          <p className={styles.lede}>Confirm your info for {orgName}.</p>
          <form className={styles.form} onSubmit={saveDetails}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="first">First name</label>
              <input id="first" className={styles.input} value={firstName}
                onChange={(e) => setFirstName(e.target.value)} maxLength={40} autoFocus />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="last">Last name</label>
              <input id="last" className={styles.input} value={lastName}
                onChange={(e) => setLastName(e.target.value)} maxLength={40} />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="nick">Nickname <span className={styles.optional}>(optional)</span></label>
              <input id="nick" className={styles.input} value={nickname}
                onChange={(e) => setNickname(e.target.value)} maxLength={40} />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="bday">Birthdate <span className={styles.optional}>(optional)</span></label>
              <input id="bday" className={styles.input} type="date" value={birthdate}
                onChange={(e) => setBirthdate(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="zip">Zip code <span className={styles.optional}>(optional)</span></label>
              <input id="zip" className={styles.input} inputMode="numeric" value={zip}
                onChange={(e) => setZip(e.target.value)} maxLength={10} />
            </div>
            {error && <p className={styles.formError}>{error}</p>}
            <button type="submit" className={styles.createBtn} disabled={!firstName.trim() || !lastName.trim()}>
              Join {orgName}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
