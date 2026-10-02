"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FEATURE_BUCKETS,
  MAX_PINNED,
  type FeatureAvailability,
  type FeatureScope,
  type FeatureVisibility,
  type ResolvedFeature,
} from "@/lib/v2/features";
import FeatureIcon from "@/app/new/_components/FeatureIcon";
import styles from "@/app/new/new.module.css";

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const toIso = (local: string): string | null => (local ? new Date(local).toISOString() : null);

/** The editable slice of a feature's config. */
interface Draft {
  visibility: FeatureVisibility;
  pinned: boolean;
  isPublic: boolean;
  label: string; // label override; empty = use catalog label
  availability: FeatureAvailability;
  availableFrom: string | null;
  availableUntil: string | null;
  notifTitle: string;
  notifBody: string;
}

function toDraft(f: ResolvedFeature): Draft {
  return {
    visibility: f.visibility,
    pinned: f.pinned,
    isPublic: f.public,
    label: f.label === f.def.label ? "" : f.label,
    availability: f.availability,
    availableFrom: f.availableFrom,
    availableUntil: f.availableUntil,
    notifTitle: f.openNotificationTitle || "",
    notifBody: f.openNotificationBody || "",
  };
}

const VIS_ORDER: FeatureVisibility[] = ["off", "everyone", "admins"];
const VIS_LABEL: Record<FeatureVisibility, string> = {
  off: "Off",
  everyone: "Everyone",
  admins: "Admins",
};
const nextVisibility = (v: FeatureVisibility): FeatureVisibility =>
  VIS_ORDER[(VIS_ORDER.indexOf(v) + 1) % VIS_ORDER.length];

/**
 * Shared feature-registry editor for both scopes. `scope='group'` edits org-wide
 * features (Articles, Music…); `scope='event'` edits per-event features and adds
 * bottom-bar pinning (≤3). Each feature is a three-state toggle: Off / Everyone /
 * Admins-only. Top-bar utilities (Chat/Photos/Music) toggle only — no pin/public.
 */
export default function FeaturesConfig({
  scope,
  endpoint,
  initial,
  backHref,
  backLabel,
  eyebrow,
  title,
  intro,
}: {
  scope: FeatureScope;
  endpoint: string; // PUT target
  initial: ResolvedFeature[];
  backHref: string;
  backLabel: string;
  eyebrow: string;
  title: string;
  intro: string;
}) {
  const router = useRouter();
  const allowPin = scope === "event";

  const scoped = useMemo(() => initial.filter((f) => f.def.scope === scope), [initial, scope]);
  const editableKeys = useMemo(
    () => scoped.filter((f) => f.def.status === "available" && !f.def.alwaysOn).map((f) => f.def.key),
    [scoped],
  );
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      scoped
        .filter((f) => f.def.status === "available" && !f.def.alwaysOn)
        .map((f) => [f.def.key, toDraft(f)]),
    ),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState(0);
  const [schedOpen, setSchedOpen] = useState<Set<string>>(new Set());
  const toggleSched = (key: string) => setSchedOpen((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  const pinnedCount = allowPin
    ? editableKeys.filter((k) => drafts[k]?.visibility !== "off" && drafts[k]?.pinned).length
    : 0;
  const pinFull = pinnedCount >= MAX_PINNED;

  function patch(key: string, next: Partial<Draft>) {
    setSavedAt(0);
    setDrafts((d) => {
      const cur = d[key];
      if (!cur) return d;
      const merged = { ...cur, ...next };
      if (next.visibility === "off") {
        merged.pinned = false;
        merged.isPublic = false;
      }
      // Spectator-public only applies when it's on for everyone.
      if (merged.visibility !== "everyone") merged.isPublic = false;
      return { ...d, [key]: merged };
    });
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    let order = 0;
    const features = editableKeys.map((key) => {
      const d = drafts[key];
      const on = d.visibility !== "off";
      const pinned = allowPin && on && d.pinned;
      return {
        feature_key: key,
        visibility: d.visibility,
        pinned,
        nav_order: pinned ? order++ : 0,
        label_override: d.label.trim() || null,
        public: d.visibility === "everyone" && d.isPublic,
        availability: d.availability,
        available_from: d.availability === "window" ? d.availableFrom : null,
        available_until: d.availability === "window" ? d.availableUntil : null,
        open_notification_title: d.notifTitle.trim() || null,
        open_notification_body: d.notifBody.trim() || null,
      };
    });
    try {
      const res = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ features }),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error || "Could not save");
        setSaving(false);
        return;
      }
      setSaving(false);
      setSavedAt(Date.now());
      router.refresh();
    } catch {
      setError("Something went wrong");
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <Link href={backHref} className={styles.back}>
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" />
        </svg>
        {backLabel}
      </Link>

      <p className={styles.eyebrow}>{eyebrow}</p>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.featIntro}>{intro}</p>

      {FEATURE_BUCKETS.map((bucket) => {
        const rows = scoped.filter((f) => f.def.bucket === bucket.key);
        if (!rows.length) return null;
        return (
          <section key={bucket.key} className={styles.featBucket}>
            <p className={styles.featBucketHead}>{bucket.label}</p>
            <div className={styles.featList}>
              {rows.map((f) => {
                const editable = f.def.status === "available" && !f.def.alwaysOn;
                const d = drafts[f.def.key];
                const vis: FeatureVisibility = editable ? d?.visibility ?? "off" : f.def.alwaysOn ? "everyone" : "off";
                const on = vis !== "off";
                // Top-bar utilities (Music) toggle only — never pinned, no
                // spectator/rename controls.
                const showSub = editable && on && !f.def.topbar;
                return (
                  <div key={f.def.key} className={styles.featRow} data-off={!on || undefined}>
                    <div className={styles.featRowMain}>
                      <span className={styles.featIcon}>
                        <FeatureIcon name={f.def.icon} />
                      </span>
                      <div className={styles.featText}>
                        <div className={styles.featLabel}>
                          {editable && d?.label.trim() ? d.label.trim() : f.def.label}
                          {f.def.topbar && <span className={styles.featChip}>Top bar</span>}
                          {!f.def.alwaysOn && f.def.status === "planned" && (
                            <span className={styles.featChip}>Coming soon</span>
                          )}
                        </div>
                        <p className={styles.featBlurb}>{f.def.blurb}</p>
                      </div>

                      {editable ? (
                        <button
                          type="button"
                          className={styles.cycleBtn}
                          data-state={vis}
                          aria-label={`${f.def.label}: ${VIS_LABEL[vis]}. Tap to change.`}
                          onClick={() => patch(f.def.key, { visibility: nextVisibility(vis) })}
                        >
                          <span className={styles.cycleDot} aria-hidden />
                          {VIS_LABEL[vis]}
                        </button>
                      ) : f.def.alwaysOn ? (
                        <span className={styles.featChip}>Always on</span>
                      ) : null}
                    </div>

                    {showSub && (
                      <div className={styles.featSub}>
                        {allowPin && (
                          <div className={styles.featSubRow}>
                            <div className={styles.featSubText}>
                              <div className={styles.featSubLabel}>Pin to bottom bar</div>
                              <div className={styles.featSubHint}>
                                {d?.pinned
                                  ? "Shown in the bottom navigation."
                                  : pinFull
                                    ? `Bottom bar is full (${MAX_PINNED} max).`
                                    : "Give it a slot in the bottom navigation."}
                              </div>
                            </div>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={!!d?.pinned}
                              aria-label={`Pin ${f.def.label}`}
                              className={styles.notifSwitch}
                              data-on={d?.pinned || undefined}
                              disabled={!d?.pinned && pinFull}
                              style={!d?.pinned && pinFull ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
                              onClick={() => patch(f.def.key, { pinned: !d?.pinned })}
                            >
                              <span className={styles.notifSwitchKnob} />
                            </button>
                          </div>
                        )}

                        {vis === "everyone" && (
                          <div className={styles.featSubRow}>
                            <div className={styles.featSubText}>
                              <div className={styles.featSubLabel}>Show to spectators</div>
                              <div className={styles.featSubHint}>Visible (read-only) on the public page.</div>
                            </div>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={!!d?.isPublic}
                              aria-label={`Make ${f.def.label} public`}
                              className={styles.notifSwitch}
                              data-on={d?.isPublic || undefined}
                              onClick={() => patch(f.def.key, { isPublic: !d?.isPublic })}
                            >
                              <span className={styles.notifSwitchKnob} />
                            </button>
                          </div>
                        )}

                        <div className={styles.featSubText} style={{ width: "100%" }}>
                          <div className={styles.featSubLabel}>Rename <span className={styles.optional}>(optional)</span></div>
                          <input
                            className={`${styles.input} ${styles.featLabelInput}`}
                            value={d?.label ?? ""}
                            onChange={(e) => patch(f.def.key, { label: e.target.value })}
                            placeholder={f.def.label}
                            maxLength={24}
                          />
                        </div>

                        <div className={styles.featSubText} style={{ width: "100%" }}>
                          <button type="button" className={styles.linkAction} onClick={() => toggleSched(f.def.key)}>
                            {schedOpen.has(f.def.key) ? "Hide scheduling" : "Scheduling & notification"}
                            {d?.availability === "window" && <span className={styles.featChip} style={{ marginLeft: 6 }}>Scheduled</span>}
                          </button>
                          {schedOpen.has(f.def.key) && (
                            <div style={{ marginTop: 8 }}>
                              <label className={styles.profileToggle} style={{ marginTop: 0 }}>
                                <input type="checkbox" checked={d?.availability === "window"}
                                  onChange={(e) => patch(f.def.key, e.target.checked ? { availability: "window" } : { availability: "always", availableFrom: null, availableUntil: null })} />
                                <span>Schedule a window (auto open &amp; close)</span>
                              </label>
                              {d?.availability === "window" && (
                                <div className={styles.profileTwoCol} style={{ marginTop: 8 }}>
                                  <div className={styles.field}>
                                    <label className={styles.label}>Opens</label>
                                    <input type="datetime-local" className={styles.input} value={toLocalInput(d?.availableFrom ?? null)} onChange={(e) => patch(f.def.key, { availableFrom: toIso(e.target.value) })} />
                                  </div>
                                  <div className={styles.field}>
                                    <label className={styles.label}>Closes</label>
                                    <input type="datetime-local" className={styles.input} value={toLocalInput(d?.availableUntil ?? null)} onChange={(e) => patch(f.def.key, { availableUntil: toIso(e.target.value) })} />
                                  </div>
                                </div>
                              )}
                              <div className={styles.field} style={{ marginTop: 8 }}>
                                <label className={styles.label}>Opening notification <span className={styles.optional}>(sent when it opens)</span></label>
                                <input className={styles.input} value={d?.notifTitle ?? ""} onChange={(e) => patch(f.def.key, { notifTitle: e.target.value })} placeholder={`e.g. ${f.def.label} is open!`} maxLength={80} />
                                <textarea className={styles.textarea} value={d?.notifBody ?? ""} onChange={(e) => patch(f.def.key, { notifBody: e.target.value })} placeholder="Body (optional)" maxLength={300} style={{ marginTop: 6 }} />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {error && <p className={styles.formError}>{error}</p>}

      <div className={styles.featSaveBar}>
        <button type="button" className={styles.createBtn} onClick={save} disabled={saving}>
          {saving ? "Saving…" : savedAt ? "Saved" : "Save changes"}
        </button>
        {allowPin && (
          <span className={styles.featPinCount}>
            {pinnedCount} of {MAX_PINNED} pinned
          </span>
        )}
      </div>
    </div>
  );
}
