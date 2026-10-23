"use client";

import { useEffect, useState } from "react";
import { pickName, type NameMode } from "@/lib/v2/profile";
import styles from "@/app/new/new.module.css";

/**
 * Per-contest collector picker (#235). Sets `v2_contests.collected_by` — who members
 * settle this contest's buy-in with. Null (the default option) falls back to the
 * event's treasurer, then the contest creator (resolveContestPayeeId). The collector
 * needs a Venmo handle or members won't get a pay button in My Money, so the picker
 * gates on it. Auto-saves on change (no Save button).
 */
interface MemberOpt { user_id: string; name: string; venmo: string | null }

export default function ContestCollector({
  base,
  orgId,
  nameMode,
  initialCollectedBy,
  defaultLabel = "Event treasurer (default)",
}: {
  base: string; // contest API root, e.g. /api/v2/orgs/{org}/events/{event}/contests/{contest}
  orgId: string;
  nameMode: NameMode;
  initialCollectedBy: string | null;
  defaultLabel?: string;
}) {
  const [collectedBy, setCollectedBy] = useState(initialCollectedBy || "");
  const [members, setMembers] = useState<MemberOpt[]>([]);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    let active = true;
    (async () => {
      const r = await fetch(`/api/v2/orgs/${orgId}/members`);
      if (!r.ok || !active) return;
      const list = ((await r.json()).members || []) as { user_id: string; display_name: string; first_name: string | null; last_name: string | null; venmo_username: string | null; archived?: boolean }[];
      setMembers(
        list
          .filter((m) => !m.archived)
          .map((m) => ({ user_id: m.user_id, name: pickName(m, nameMode), venmo: m.venmo_username }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    })();
    return () => { active = false; };
  }, [orgId, nameMode]);

  async function save(next: string) {
    setCollectedBy(next);
    setStatus("saving");
    await fetch(base, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collected_by: next || null }),
    });
    setStatus("saved");
  }

  const collectorVenmo = collectedBy ? members.find((m) => m.user_id === collectedBy)?.venmo : undefined;

  return (
    <div style={{ marginTop: 20 }}>
      <p className={styles.sectionLabel}>Who&apos;s collecting?</p>
      <div className={styles.field}>
        <label className={styles.label}>
          Collector <span className={styles.optional}>(members settle their buy-in with this person)</span>
        </label>
        <select className={styles.roleSelect} value={collectedBy} onChange={(e) => save(e.target.value)}>
          <option value="">{defaultLabel}</option>
          {collectedBy && !members.some((m) => m.user_id === collectedBy) && (
            <option value={collectedBy}>Current collector</option>
          )}
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id} disabled={!m.venmo && m.user_id !== collectedBy}>
              {m.name}{m.venmo ? "" : " (needs Venmo)"}
            </option>
          ))}
        </select>
        {collectedBy && collectorVenmo === null && (
          <p className={styles.formError} style={{ marginTop: 4 }}>
            This collector has no Venmo on file — members won&apos;t get a pay button.
          </p>
        )}
        {status === "saved" && <p className={styles.roundFormHint} style={{ marginTop: 4 }}>Saved.</p>}
      </div>
    </div>
  );
}
