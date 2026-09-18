"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { NameMode } from "@/lib/v2/profile";
import styles from "@/app/new/new.module.css";
import DomainsManager from "./DomainsManager";

export default function GroupSettingsForm({
  orgId,
  slug,
  initialName,
  initialColor,
  initialLogo,
  initialStoreUrl,
  initialStoreLabel,
  initialStoreEnabled,
  initialNameDisplay,
  initialSystemName,
  initialSystemAvatar,
}: {
  orgId: string;
  slug: string;
  initialName: string;
  initialColor: string;
  initialLogo: string | null;
  initialStoreUrl: string | null;
  initialStoreLabel: string | null;
  initialStoreEnabled: boolean;
  initialNameDisplay: NameMode;
  initialSystemName: string;
  initialSystemAvatar: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [nameDisplay, setNameDisplay] = useState<NameMode>(initialNameDisplay);
  const [storeUrl, setStoreUrl] = useState(initialStoreUrl || "");
  const [storeLabel, setStoreLabel] = useState(initialStoreLabel || "");
  const [storeEnabled, setStoreEnabled] = useState(initialStoreEnabled);
  const [logo, setLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(initialLogo);
  const [systemName, setSystemName] = useState(initialSystemName);
  const [systemAvatar, setSystemAvatar] = useState<File | null>(null);
  const [systemAvatarPreview, setSystemAvatarPreview] = useState<string | null>(initialSystemAvatar);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const systemFileRef = useRef<HTMLInputElement>(null);

  function pickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setLogo(f);
    if (f) setLogoPreview(URL.createObjectURL(f));
  }

  function pickSystemAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setSystemAvatar(f);
    if (f) setSystemAvatarPreview(URL.createObjectURL(f));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/v2/orgs/${orgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          primary_color: color,
          name_display: nameDisplay,
          store_url: storeUrl.trim() || null,
          store_label: storeLabel.trim() || null,
          store_enabled: storeEnabled,
          system_name: systemName.trim() || "System",
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Could not save");
        setSaving(false);
        return;
      }
      if (logo) {
        const fd = new FormData();
        fd.append("file", logo);
        const up = await fetch(`/api/v2/orgs/${orgId}/logo`, { method: "POST", body: fd });
        if (!up.ok) {
          const d = await up.json().catch(() => ({}));
          setError(d.error || "Logo upload failed");
          setSaving(false);
          return;
        }
      }
      if (systemAvatar) {
        const fd = new FormData();
        fd.append("file", systemAvatar);
        const up = await fetch(`/api/v2/orgs/${orgId}/system-avatar`, { method: "POST", body: fd });
        if (!up.ok) {
          const d = await up.json().catch(() => ({}));
          setError(d.error || "System avatar upload failed");
          setSaving(false);
          return;
        }
      }
      router.push(`/new/${slug}/admin`);
      router.refresh();
    } catch {
      setError("Something went wrong");
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <Link href={`/new/${slug}/admin`} className={styles.back}>
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </Link>

      <p className={styles.eyebrow}>Group settings</p>
      <h1 className={styles.title}>Configure</h1>

      <form className={styles.form} onSubmit={submit}>
        {/* Group basics — logo, name, brand color. Closed state previews the logo + name. */}
        <details className={styles.accordion}>
          <summary className={styles.accordionSummary}>
            <span>Group</span>
            <span className={styles.accordionSummaryRight}>
              <span className={styles.summaryPreview}>
                <span
                  className={styles.summaryThumb}
                  aria-hidden
                  style={logoPreview ? { backgroundImage: `url(${logoPreview})` } : { backgroundColor: color }}
                >
                  {!logoPreview && (name.charAt(0).toUpperCase() || "?")}
                </span>
                <span>{name || "Unnamed group"}</span>
              </span>
              <svg className={styles.chev} width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          </summary>
          <div className={styles.accordionBody}>
            <div className={styles.field}>
              <label className={styles.label}>Logo</label>
              <div className={styles.logoRow}>
                <button
                  type="button"
                  className={styles.logoPreview}
                  onClick={() => fileRef.current?.click()}
                  aria-label="Choose a logo"
                  style={
                    logoPreview
                      ? { backgroundImage: `url(${logoPreview})`, backgroundColor: "transparent" }
                      : { backgroundColor: color }
                  }
                >
                  {!logoPreview && (name.charAt(0).toUpperCase() || "?")}
                </button>
                <div>
                  <button type="button" className={styles.fileBtn} onClick={() => fileRef.current?.click()}>
                    {logoPreview ? "Change logo" : "Choose logo"}
                  </button>
                  <p className={styles.swatchHint}>PNG, JPG, WEBP, or SVG</p>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={pickLogo}
                  hidden
                />
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="name">
                Group name
              </label>
              <input
                id="name"
                className={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="color">
                Brand color
              </label>
              <div className={styles.colorRow}>
                <input
                  id="color"
                  type="color"
                  className={styles.swatch}
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                />
                <span className={styles.swatchHint}>Tints your group&apos;s accents.</span>
              </div>
            </div>
          </div>
        </details>

        {/* Member names — a toggle right on the summary; the body just explains it. */}
        <details className={styles.accordion}>
          <summary className={styles.accordionSummary}>
            <span>Member names</span>
            <span className={styles.accordionSummaryRight}>
              <span className={styles.segToggle} role="group" aria-label="Member name display">
                <button
                  type="button"
                  className={styles.segOption}
                  data-on={nameDisplay === "nickname" || undefined}
                  aria-pressed={nameDisplay === "nickname"}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setNameDisplay("nickname");
                  }}
                >
                  Nicknames
                </button>
                <button
                  type="button"
                  className={styles.segOption}
                  data-on={nameDisplay === "real" || undefined}
                  aria-pressed={nameDisplay === "real"}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setNameDisplay("real");
                  }}
                >
                  Real names
                </button>
              </span>
              <svg className={styles.chev} width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          </summary>
          <div className={styles.accordionBody}>
            <p className={styles.swatchHint} style={{ marginTop: 4 }}>
              How members are shown across the app. <strong>Nicknames</strong> shows each member&apos;s handle;
              <strong> Real names</strong> shows their First Last. Either way, anyone missing the chosen name
              falls back to the other — so a member without a nickname still shows their real name.
            </p>
          </div>
        </details>

        {/* System identity — avatar + name previewed on the summary. */}
        <details className={styles.accordion}>
          <summary className={styles.accordionSummary}>
            <span>System identity</span>
            <span className={styles.accordionSummaryRight}>
              <span className={styles.summaryPreview}>
                <span
                  className={`${styles.summaryThumb} ${styles.summaryThumbRound}`}
                  aria-hidden
                  style={
                    systemAvatarPreview
                      ? { backgroundImage: `url(${systemAvatarPreview})` }
                      : { backgroundColor: color }
                  }
                >
                  {!systemAvatarPreview && (systemName.charAt(0).toUpperCase() || "S")}
                </span>
                <span>{systemName || "System"}</span>
              </span>
              <svg className={styles.chev} width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          </summary>
          <div className={styles.accordionBody}>
            <div className={styles.field}>
              <label className={styles.label}>Avatar</label>
              <div className={styles.logoRow}>
                <button
                  type="button"
                  className={styles.logoPreview}
                  onClick={() => systemFileRef.current?.click()}
                  aria-label="Choose a system avatar"
                  style={
                    systemAvatarPreview
                      ? { backgroundImage: `url(${systemAvatarPreview})`, backgroundColor: "transparent", borderRadius: "50%" }
                      : { backgroundColor: color, borderRadius: "50%" }
                  }
                >
                  {!systemAvatarPreview && (systemName.charAt(0).toUpperCase() || "S")}
                </button>
                <div>
                  <button type="button" className={styles.fileBtn} onClick={() => systemFileRef.current?.click()}>
                    {systemAvatarPreview ? "Change avatar" : "Choose avatar"}
                  </button>
                  <p className={styles.swatchHint}>PNG, JPG, WEBP, or SVG</p>
                </div>
                <input
                  ref={systemFileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={pickSystemAvatar}
                  hidden
                />
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="systemName">
                Name
              </label>
              <input
                id="systemName"
                className={styles.input}
                value={systemName}
                onChange={(e) => setSystemName(e.target.value)}
                maxLength={40}
                placeholder="System"
              />
            </div>

            <p className={styles.swatchHint}>
              The name and face shown when an announcement is sent &ldquo;as the system&rdquo; instead of by a
              person (e.g. automated posts). Defaults to &ldquo;System&rdquo;.
            </p>
          </div>
        </details>

        <details className={styles.accordion}>
          <summary className={styles.accordionSummary}>
            <span>Store</span>
            <span className={styles.accordionSummaryRight}>
              {/* Enable/disable the Store card on the home page. Stop the click
                  from toggling the accordion open/closed. */}
              <button
                type="button"
                role="switch"
                aria-checked={storeEnabled}
                aria-label="Show store on home page"
                className={styles.notifSwitch}
                data-on={storeEnabled || undefined}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setStoreEnabled((v) => !v);
                }}
              >
                <span className={styles.notifSwitchKnob} />
              </button>
              <svg className={styles.chev} width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          </summary>
          <div className={styles.accordionBody}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="storeUrl">
                Store link
              </label>
              <input
                id="storeUrl"
                className={styles.input}
                value={storeUrl}
                onChange={(e) => setStoreUrl(e.target.value)}
                placeholder="https://your-shop.com"
                inputMode="url"
              />
              <p className={styles.swatchHint}>
                External merch shop. Leave blank to hide the Store card.
              </p>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="storeLabel">
                Store label
              </label>
              <input
                id="storeLabel"
                className={styles.input}
                value={storeLabel}
                onChange={(e) => setStoreLabel(e.target.value)}
                placeholder="Get the gear"
                maxLength={60}
              />
              <p className={styles.swatchHint}>Optional headline for the card.</p>
            </div>
          </div>
        </details>

        <DomainsManager orgId={orgId} />

        {error && <p className={styles.formError}>{error}</p>}

        <div className={styles.actions}>
          <button
            type="submit"
            className={styles.createBtn}
            disabled={!name.trim() || saving}
            style={{ opacity: !name.trim() || saving ? 0.6 : 1 }}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          <Link href={`/new/${slug}/admin`} className={styles.cancel}>
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
