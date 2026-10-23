"use client";

import { useEffect, useState } from "react";
import { pickName, type NameMode } from "@/lib/v2/profile";
import styles from "@/app/new/new.module.css";

/**
 * Per-contest collector picker (#235). Sets `v2_contests.collected_by` — who members
 * settle this contest's buy-in with. Defaults the selection to the active user (the
 * admin setting it up), never an abstract "creator/treasurer" option. The collector
 * needs a Venmo handle or members won't get a pay button in My Money, so the picker
 * gates on it.
 *
 * Two modes:
 *  - Uncontrolled (default): auto-saves on change — for pages with no Save button.
 *  - Controlled (`value` + `onChange`): reports the pick up and does NOT save — for
 *    a host form (e.g. the Squares editor) that persists it with its own Save button.
 *
 * Style-agnostic: pass `labelClassName`/`selectClassName` to match the host form;
 * defaults match the shared `.input` look.
 */
interface MemberOpt { user_id: string; name: string; venmo: string | null }

export default function ContestCollector({
  base,
  orgId,
  nameMode,
  currentUserId,
  initialCollectedBy,
  value,
  onChange,
  labelClassName,
  selectClassName,
}: {
  base: string; // contest API root, e.g. /api/v2/orgs/{org}/events/{event}/contests/{contest}
  orgId: string;
  nameMode: NameMode;
  currentUserId: string;
  initialCollectedBy: string | null;
  value?: string;                       // controlled value (with onChange)
  onChange?: (next: string) => void;    // controlled: report pick, host saves it
  labelClassName?: string;
  selectClassName?: string;
}) {
  const controlled = onChange !== undefined;
  // Pre-select the active user when nobody's set yet (parity with GroupContestMoney).
  const [internal, setInternal] = useState(initialCollectedBy || currentUserId);
  const collectedBy = controlled ? (value ?? "") : internal;
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
    // Controlled: hand the pick to the host form; it persists on its own Save.
    if (controlled) { onChange!(next); return; }
    setInternal(next);
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
    <div className={styles.field} style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <label className={labelClassName ?? styles.label}>
          Who&apos;s collecting? <span className={styles.optional}>(needs Venmo)</span>
        </label>
        {!controlled && status !== "idle" && (
          <span className={styles.optional} style={{ whiteSpace: "nowrap" }}>
            {status === "saving" ? "Saving…" : "Saved"}
          </span>
        )}
      </div>
      <select className={selectClassName ?? styles.selectInput} value={collectedBy} onChange={(e) => save(e.target.value)}>
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
    </div>
  );
}
