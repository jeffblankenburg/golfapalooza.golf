"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "../new.module.css";

export default function CreateGroupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#0a5c36");
  const [logo, setLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function pickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setLogo(f);
    setLogoPreview(f ? URL.createObjectURL(f) : null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v2/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), primary_color: color }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not create group");
        setSaving(false);
        return;
      }
      // Upload the logo after the org exists so it lands in that org's folder.
      if (logo) {
        const fd = new FormData();
        fd.append("file", logo);
        const up = await fetch(`/api/v2/orgs/${data.id}/logo`, {
          method: "POST",
          body: fd,
        });
        if (!up.ok) {
          const upErr = await up.json().catch(() => ({}));
          // Group exists; just surface the logo problem instead of blocking.
          setError((upErr.error || "Logo upload failed") + " — you can add it in settings.");
        }
      }
      router.push(`/new/${data.slug}`);
    } catch {
      setError("Something went wrong");
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <Link href="/new" className={styles.back}>
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" />
        </svg>
        All groups
      </Link>

      <p className={styles.eyebrow}>New group</p>
      <h1 className={styles.title}>Create a group</h1>
      <p className={styles.lede}>
        You&apos;ll be the owner. Everyone else joins by an invite code you share —
        there&apos;s no open sign-up to a group.
      </p>

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
                {logo ? "Change logo" : "Choose logo"}
              </button>
              <p className={styles.swatchHint}>PNG, JPG, WEBP, or SVG (optional)</p>
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
          <label className={styles.label} htmlFor="group-name">
            Group name
          </label>
          <input
            id="group-name"
            className={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Pine Valley Society"
            maxLength={80}
            autoFocus
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="group-color">
            Brand color
          </label>
          <div className={styles.colorRow}>
            <input
              id="group-color"
              type="color"
              className={styles.swatch}
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
            <span className={styles.swatchHint}>Tints your group&apos;s accents.</span>
          </div>
        </div>

        {error && <p className={styles.formError}>{error}</p>}

        <div className={styles.actions}>
          <button
            type="submit"
            className={styles.createBtn}
            disabled={!name.trim() || saving}
            style={{ opacity: !name.trim() || saving ? 0.6 : 1 }}
          >
            {saving ? "Creating…" : "Create group"}
          </button>
          <Link href="/new" className={styles.cancel}>
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
