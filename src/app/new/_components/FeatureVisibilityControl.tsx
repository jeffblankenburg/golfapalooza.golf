"use client";

import { useEffect, useRef, useState } from "react";
import Modal from "@/app/new/_components/Modal";
import { FEATURE_BY_KEY, MAX_PINNED } from "@/lib/v2/features";
import ZonedDateTimeField from "@/app/new/_components/ZonedDateTimeField";
import styles from "@/app/new/new.module.css";

/** The resolved feature config we need to re-send (the PUT replaces the whole row). */
export interface FeatureConfig {
  visibility: string;
  pinned: boolean;
  public: boolean;
  label: string;
  navOrder: number;
  availability: string;
  availableFrom: string | null;
  availableUntil: string | null;
  openNotificationTitle: string | null;
  openNotificationBody: string | null;
}

const VIS_ORDER = ["off", "everyone", "admins"] as const;
const VIS_LABEL: Record<string, string> = { off: "Off", everyone: "Everyone", admins: "Admins" };
const nextVisibility = (v: string): string =>
  VIS_ORDER[(VIS_ORDER.indexOf(v as (typeof VIS_ORDER)[number]) + 1) % VIS_ORDER.length];

interface Draft {
  visibility: string;
  pinned: boolean;
  isPublic: boolean;
  label: string; // override; empty = catalog default
  availability: string;
  availableFrom: string | null;
  availableUntil: string | null;
  notifTitle: string;
  notifBody: string;
}

/**
 * Member-visibility control on an admin feature card: the inline Off / Admins /
 * Everyone switch, plus an "Advanced" modal for the rest of a feature's config
 * (pin to bottom bar, spectator-public, rename, open window + launch notification).
 * One shared draft, debounced auto-save. Replaces the standalone Features pages.
 *
 * Scope: pass `eventId` for event features (enables pin + scheduling); omit for group.
 * `topbar` features (Chat/Photos/Music) are toggle-only — no Advanced.
 */
export default function FeatureVisibilityControl({
  orgId,
  eventId,
  featureKey,
  config,
  topbar = false,
  timeZone,
}: {
  orgId: string;
  eventId?: string;
  featureKey: string;
  config: FeatureConfig;
  topbar?: boolean;
  timeZone: string;
}) {
  const def = FEATURE_BY_KEY[featureKey];
  const allowPin = !!eventId && !topbar;
  const endpoint = eventId
    ? `/api/v2/orgs/${orgId}/events/${eventId}/features`
    : `/api/v2/orgs/${orgId}/features`;

  const [d, setD] = useState<Draft>({
    visibility: config.visibility,
    pinned: config.pinned,
    isPublic: config.public,
    label: def && config.label === def.label ? "" : config.label,
    availability: config.availability,
    availableFrom: config.availableFrom,
    availableUntil: config.availableUntil,
    notifTitle: config.openNotificationTitle || "",
    notifBody: config.openNotificationBody || "",
  });
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const first = useRef(true);

  // Debounced auto-save whenever the draft changes.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setStatus("saving");
    const t = setTimeout(async () => {
      const on = d.visibility !== "off";
      const pinned = allowPin && on && d.pinned;
      try {
        const res = await fetch(endpoint, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            features: [
              {
                feature_key: featureKey,
                visibility: d.visibility,
                pinned,
                nav_order: config.navOrder,
                label_override: d.label.trim() || null,
                public: d.visibility === "everyone" && d.isPublic,
                availability: d.availability,
                available_from: d.availability === "window" ? d.availableFrom : null,
                available_until: d.availability === "window" ? d.availableUntil : null,
                open_notification_title: d.notifTitle.trim() || null,
                open_notification_body: d.notifBody.trim() || null,
              },
            ],
          }),
        });
        setStatus(res.ok ? "saved" : "error");
      } catch {
        setStatus("error");
      }
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);

  function patch(next: Partial<Draft>) {
    setD((c) => {
      const m = { ...c, ...next };
      if (m.visibility === "off") m.pinned = false;
      if (m.visibility !== "everyone") m.isPublic = false;
      return m;
    });
  }

  return (
    <div className={styles.featVisRow} onClick={(e) => e.stopPropagation()} role="group" aria-label="Member visibility">
      <button
        type="button"
        className={styles.cycleBtn}
        data-state={d.visibility}
        aria-label={`Visibility: ${VIS_LABEL[d.visibility]}. Tap to change.`}
        onClick={() => patch({ visibility: nextVisibility(d.visibility) })}
      >
        <span className={styles.cycleDot} aria-hidden />
        {VIS_LABEL[d.visibility]}
      </button>
      {!topbar && (
        <button
          type="button"
          className={styles.featGearBtn}
          onClick={() => setOpen(true)}
          aria-label={`${def?.label || "Feature"} settings`}
          title="Settings"
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <circle cx="12" cy="12" r="3" strokeWidth={1.7} />
          </svg>
        </button>
      )}
      {status === "error" && <span className={styles.featVisErr} title="Could not save">!</span>}

      <Modal open={open} title={`${def?.label || "Feature"} settings`} onClose={() => setOpen(false)}>
        <div className={styles.form}>
          {allowPin && (
            <label className={styles.profileToggle} style={{ marginTop: 0 }}>
              <input
                type="checkbox"
                checked={d.pinned}
                disabled={d.visibility === "off"}
                onChange={(e) => patch({ pinned: e.target.checked })}
              />
              <span>Pin to bottom bar <span className={styles.optional}>(max {MAX_PINNED})</span></span>
            </label>
          )}

          {d.visibility === "everyone" && (
            <label className={styles.profileToggle} style={{ marginTop: allowPin ? 10 : 0 }}>
              <input type="checkbox" checked={d.isPublic} onChange={(e) => patch({ isPublic: e.target.checked })} />
              <span>Show to spectators <span className={styles.optional}>(public, read-only)</span></span>
            </label>
          )}

          <div className={styles.field}>
            <label className={styles.label}>Rename <span className={styles.optional}>(optional)</span></label>
            <input
              className={styles.input}
              value={d.label}
              onChange={(e) => patch({ label: e.target.value })}
              placeholder={def?.label}
              maxLength={24}
            />
          </div>

          {eventId && (
            <>
              <label className={styles.profileToggle}>
                <input
                  type="checkbox"
                  checked={d.availability === "window"}
                  onChange={(e) =>
                    patch(e.target.checked ? { availability: "window" } : { availability: "always", availableFrom: null, availableUntil: null })
                  }
                />
                <span>Schedule a window <span className={styles.optional}>(auto open &amp; close)</span></span>
              </label>
              {d.availability === "window" && (
                <div className={styles.profileTwoCol}>
                  <ZonedDateTimeField label="Opens" value={d.availableFrom} timeZone={timeZone} onChange={(iso) => patch({ availableFrom: iso })} />
                  <ZonedDateTimeField label="Closes" value={d.availableUntil} timeZone={timeZone} onChange={(iso) => patch({ availableUntil: iso })} />
                </div>
              )}
              <div className={styles.field}>
                <label className={styles.label}>Opening notification <span className={styles.optional}>(sent when it opens)</span></label>
                <input className={styles.input} value={d.notifTitle} onChange={(e) => patch({ notifTitle: e.target.value })} placeholder={`e.g. ${def?.label} is open!`} maxLength={80} />
                <textarea className={styles.textarea} value={d.notifBody} onChange={(e) => patch({ notifBody: e.target.value })} placeholder="Body (optional)" maxLength={300} style={{ marginTop: 6 }} />
              </div>
            </>
          )}

          <p className={styles.featAdvNote}>
            {status === "saving" ? "Saving…" : status === "error" ? "Could not save — try again." : "Changes save automatically."}
          </p>
        </div>
      </Modal>
    </div>
  );
}
