"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { v2BrowserClient } from "@/lib/v2/supabase-browser";
import { formatPhone } from "@/lib/v2/phone";
import { pickName } from "@/lib/v2/profile";
import { useNameMode } from "./NameMode";
import SimControl from "./SimControl";
import styles from "@/app/new/new.module.css";
/* eslint-disable @next/next/no-img-element */

interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  birthdate: string | null;
  zip: string | null;
  occupation: string | null;
  city: string | null;
  state: string | null;
  playing_since: number | null;
  swings: string | null;
  typical_shot: string | null;
  shirt_size: string | null;
  fun_fact: string | null;
  best_shot: string | null;
  show_on_map: boolean;
}

const SWINGS = ["right", "left", "both"];
const SHOTS = ["straight", "slice", "hook", "draw", "fade"];
const SHIRTS = ["S", "M", "L", "XL", "2XL", "3XL", "4XL"];

/** Profile & settings drawer content. Loads the caller's profile the first time
 *  it's opened; edits save to /api/v2/profile. */
export default function ProfileDrawer({ active, orgId, canSim }: { active: boolean; orgId?: string; canSim?: boolean }) {
  const router = useRouter();
  const mode = useNameMode();
  const [p, setP] = useState<Profile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const requested = useRef(false);

  useEffect(() => {
    if (!active || requested.current) return;
    requested.current = true;
    fetch("/api/v2/profile")
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error || `Failed to load (${r.status})`);
        }
        return r.json();
      })
      .then((d) => setP(d.profile))
      .catch((e) => setError(e.message || "Couldn't load your profile"))
      .finally(() => setLoaded(true));
  }, [active]);

  function set<K extends keyof Profile>(key: K, value: Profile[K]) {
    setP((cur) => (cur ? { ...cur, [key]: value } : cur));
    setStatus(null);
  }

  async function save() {
    if (!p || saving) return;
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/v2/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: p.first_name,
          last_name: p.last_name,
          nickname: p.nickname,
          birthdate: p.birthdate,
          zip: p.zip,
          occupation: p.occupation,
          city: p.city,
          state: p.state,
          playing_since: p.playing_since,
          swings: p.swings,
          typical_shot: p.typical_shot,
          shirt_size: p.shirt_size,
          fun_fact: p.fun_fact,
          best_shot: p.best_shot,
          show_on_map: p.show_on_map,
        }),
      });
      if (!res.ok) throw new Error();
      const d = await res.json();
      setP(d.profile);
      setStatus("Saved");
    } catch {
      setError("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    const fd = new FormData();
    fd.append("file", f);
    try {
      const res = await fetch("/api/v2/profile/avatar", { method: "POST", body: fd });
      if (!res.ok) throw new Error();
      const d = await res.json();
      set("avatar_url", d.avatar_url);
      router.refresh(); // update the top-nav avatar too
    } catch {
      setError("Avatar upload failed");
    }
  }

  async function signOut() {
    await v2BrowserClient().auth.signOut();
    router.push("/new");
    router.refresh();
  }

  if (!loaded) return <p className={styles.drawerStub}>Loading…</p>;
  if (!p) return <p className={styles.drawerStub}>{error || "No profile found."}</p>;

  const phone = p.phone ? formatPhone(p.phone) : null;

  return (
    <div className={styles.profileForm}>
      {/* Avatar */}
      <div className={styles.profileAvatarRow}>
        {p.avatar_url ? (
          <img src={p.avatar_url} alt="" className={styles.profileAvatar} />
        ) : (
          <div className={styles.profileAvatarFallback}>
            {(pickName(p, mode)[0] || "?").toUpperCase()}
          </div>
        )}
        <div>
          <p className={styles.profileName}>{pickName(p, mode)}</p>
          <button type="button" className={styles.fileBtn} onClick={() => fileRef.current?.click()}>
            Change photo
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={uploadAvatar}
          hidden
        />
      </div>

      <Field label="First name">
        <input className={styles.input} value={p.first_name || ""} onChange={(e) => set("first_name", e.target.value)} />
      </Field>
      <Field label="Last name">
        <input className={styles.input} value={p.last_name || ""} onChange={(e) => set("last_name", e.target.value)} />
      </Field>
      <Field label="Nickname">
        <input className={styles.input} value={p.nickname || ""} onChange={(e) => set("nickname", e.target.value)} placeholder="Your handle" />
      </Field>
      {phone && (
        <Field label="Phone">
          <p className={styles.readonlyValue}>
            {phone.flag} {phone.text}
          </p>
        </Field>
      )}
      <Field label="Birthday">
        <input type="date" className={styles.input} value={p.birthdate || ""} onChange={(e) => set("birthdate", e.target.value || null)} />
      </Field>

      <div className={styles.profileTwoCol}>
        <Field label="City">
          <input className={styles.input} value={p.city || ""} onChange={(e) => set("city", e.target.value)} />
        </Field>
        <Field label="State">
          <input className={styles.input} value={p.state || ""} maxLength={2} onChange={(e) => set("state", e.target.value)} />
        </Field>
      </div>
      <Field label="ZIP">
        <input className={styles.input} value={p.zip || ""} onChange={(e) => set("zip", e.target.value)} inputMode="numeric" />
      </Field>

      <Field label="Occupation">
        <input className={styles.input} value={p.occupation || ""} onChange={(e) => set("occupation", e.target.value)} />
      </Field>

      <div className={styles.profileTwoCol}>
        <Field label="Playing since">
          <input type="number" className={styles.input} value={p.playing_since ?? ""} min={1900} max={new Date().getFullYear()} onChange={(e) => set("playing_since", e.target.value ? Number(e.target.value) : null)} />
        </Field>
        <Field label="Shirt size">
          <select className={styles.input} value={p.shirt_size || ""} onChange={(e) => set("shirt_size", e.target.value || null)}>
            <option value="">—</option>
            {SHIRTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
      </div>

      <div className={styles.profileTwoCol}>
        <Field label="Swings">
          <select className={styles.input} value={p.swings || ""} onChange={(e) => set("swings", e.target.value || null)}>
            <option value="">—</option>
            {SWINGS.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
        </Field>
        <Field label="Typical shot">
          <select className={styles.input} value={p.typical_shot || ""} onChange={(e) => set("typical_shot", e.target.value || null)}>
            <option value="">—</option>
            {SHOTS.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Fun fact">
        <textarea className={styles.textarea} value={p.fun_fact || ""} onChange={(e) => set("fun_fact", e.target.value)} rows={2} />
      </Field>
      <Field label="Best shot">
        <textarea className={styles.textarea} value={p.best_shot || ""} onChange={(e) => set("best_shot", e.target.value)} rows={2} />
      </Field>

      <label className={styles.profileToggle}>
        <input type="checkbox" checked={p.show_on_map} onChange={(e) => set("show_on_map", e.target.checked)} />
        <span>Show me on the Loozer map</span>
      </label>

      {error && <p className={styles.formError}>{error}</p>}

      {canSim && orgId && <SimControl orgId={orgId} active={active} />}

      <div className={styles.profileActions}>
        <button type="button" className={styles.createBtn} onClick={save} disabled={saving} style={{ opacity: saving ? 0.6 : 1 }}>
          {saving ? "Saving…" : status || "Save changes"}
        </button>
        <button type="button" className={styles.signOutBtn} onClick={signOut}>
          Sign out
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      {children}
    </div>
  );
}
