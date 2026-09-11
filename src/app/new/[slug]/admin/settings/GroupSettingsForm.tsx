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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function pickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setLogo(f);
    if (f) setLogoPreview(URL.createObjectURL(f));
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
              <button
                type="button"
                className={styles.fileBtn}
                onClick={() => fileRef.current?.click()}
              >
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

        <div className={styles.field}>
          <label className={styles.label} htmlFor="nameDisplay">
            Member names
          </label>
          <select
            id="nameDisplay"
            className={styles.input}
            value={nameDisplay}
            onChange={(e) => setNameDisplay(e.target.value as NameMode)}
          >
            <option value="nickname">Nicknames</option>
            <option value="real">Real names (First Last)</option>
          </select>
          <p className={styles.swatchHint}>
            How members are shown across the app. Real names fall back to a member&apos;s nickname if
            they haven&apos;t set a first/last name.
          </p>
        </div>

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
