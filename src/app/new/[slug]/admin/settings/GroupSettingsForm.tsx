"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
}: {
  orgId: string;
  slug: string;
  initialName: string;
  initialColor: string;
  initialLogo: string | null;
  initialStoreUrl: string | null;
  initialStoreLabel: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [storeUrl, setStoreUrl] = useState(initialStoreUrl || "");
  const [storeLabel, setStoreLabel] = useState(initialStoreLabel || "");
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
          store_url: storeUrl.trim() || null,
          store_label: storeLabel.trim() || null,
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
