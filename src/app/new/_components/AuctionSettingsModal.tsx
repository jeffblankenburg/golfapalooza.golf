"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Modal from "@/app/new/_components/Modal";
import { SCORING_MODES } from "@/lib/v2/contests/auction";
import type { PayoutSplit } from "@/lib/v2/contests/payouts";
import styles from "@/app/new/new.module.css";

const LABEL = { display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: 4 } as const;
const toD = (c: number) => (c / 100).toString();
const toCents = (s: string) => Math.max(0, Math.round((Number(s) || 0) * 100));

/** A $-prefixed money input; reports whole cents on blur. */
function Money({ label, hint, defaultDollars, disabled, onCents }: { label: string; hint?: string; defaultDollars: string; disabled: boolean; onCents: (c: number) => void }) {
  return (
    <label><span style={LABEL}>{label}{hint ? <span style={{ fontWeight: 400, color: "var(--ink-soft)" }}> {hint}</span> : null}</span>
      <span style={{ position: "relative", display: "block" }}>
        <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ink-soft)" }}>$</span>
        <input className={styles.input} style={{ width: "100%", paddingLeft: 22 }} inputMode="decimal" defaultValue={defaultDollars} disabled={disabled}
          onBlur={(e) => onCents(toCents(e.target.value))} />
      </span>
    </label>
  );
}

interface Data {
  name: string; status: string; config: Record<string, unknown>; payoutSplits: PayoutSplit[];
  buyInCents: number; isEvent: boolean; eventId: string | null; tournaments: { id: string; name: string }[];
}

/**
 * The one auction settings gear — shared by the group and event contest lists. All setup
 * config lives here (name, visibility, tournament, buy-in, salary cap, bid increment,
 * scoring, payouts); the detail page is just the recorder. Fields auto-save (no Save
 * button); the buy-in routes to config.entry_cents for group auctions and to the event
 * buy-in cost_item for event auctions.
 */
export default function AuctionSettingsModal({ slug, orgId, contestId, onClose, onSaved }: {
  slug: string; orgId: string; contestId: string; onClose: () => void; onSaved: () => void;
}) {
  const base = `/api/v2/orgs/${orgId}/contests/${contestId}`;
  const [d, setD] = useState<Data | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    let live = true;
    (async () => {
      const r = await fetch(`${base}/auction`);
      if (live && r.ok) setD(await r.json());
    })();
    return () => { live = false; };
  }, [base]);

  // Fire a save; show a transient status; refresh the underlying list/detail.
  async function save(fn: () => Promise<Response>) {
    setStatus("saving");
    try {
      const r = await fn();
      setStatus(r.ok ? "saved" : "error");
      if (r.ok) onSaved();
    } catch { setStatus("error"); }
  }
  const settings = (body: Record<string, unknown>) => save(() => fetch(`${base}/auction`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "settings", ...body }) }));
  const patch = (body: Record<string, unknown>) => save(() => fetch(base, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

  const cfg = (d?.config ?? {}) as { tournament_id?: string; salary_cap_cents?: number; bid_increment_cents?: number; scoring_mode?: string };

  return (
    <Modal open title="Auction settings" onClose={onClose}>
      {!d ? (
        <p className={styles.roundFormHint} style={{ margin: 0 }}>Loading…</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label><span style={LABEL}>Name</span>
            <input className={styles.input} style={{ width: "100%" }} defaultValue={d.name} maxLength={80} onBlur={(e) => { const n = e.target.value.trim(); if (n && n !== d.name) void patch({ name: n }); }} />
          </label>

          <label><span style={LABEL}>Tournament</span>
            <select className={styles.selectInput} defaultValue={cfg.tournament_id ?? ""} onChange={(e) => void settings({ tournament_id: e.target.value })}>
              <option value="">Choose a tournament…</option>
              {d.tournaments.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <Link href={`/new/${slug}/admin/tournaments`} className={styles.linkAction} style={{ display: "inline-block", marginTop: 4, fontSize: "0.8rem" }}>Manage tournaments</Link>
          </label>

          <label><span style={LABEL}>Visible to members</span>
            <select className={styles.selectInput} defaultValue={d.status} onChange={(e) => void patch({ status: e.target.value })}>
              <option value="draft">Draft, hidden</option>
              <option value="active">Open, shown</option>
              <option value="final">Final, closed</option>
            </select>
          </label>

          <div>
            {d.isEvent
              ? <Money label="Buy-in" defaultDollars={toD(d.buyInCents)} disabled={status === "saving"} onCents={(c) => void save(() => fetch(`/api/v2/orgs/${orgId}/events/${d.eventId}/contests/${contestId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entry_amount_cents: c }) }))} />
              : <Money label="Buy-in" defaultDollars={toD(d.buyInCents)} disabled={status === "saving"} onCents={(c) => void settings({ entry_cents: c })} />}
            {d.isEvent && <p className={styles.roundFormHint} style={{ margin: "4px 0 0" }}>Part of the event money — trip cost or option is set in <Link href={`/new/${slug}/admin/events/${d.eventId}/financials`} className={styles.linkAction}>Financials</Link>.</p>}
          </div>

          <div className={styles.profileTwoCol}>
            <Money label="Salary cap" defaultDollars={toD(Number(cfg.salary_cap_cents) || 10000)} disabled={status === "saving"} onCents={(c) => void settings({ salary_cap_cents: c })} />
            <Money label="Bid increment" defaultDollars={toD(Number(cfg.bid_increment_cents) || 500)} disabled={status === "saving"} onCents={(c) => void settings({ bid_increment_cents: c })} />
          </div>

          <label><span style={LABEL}>Scoring</span>
            <select className={styles.selectInput} defaultValue={(cfg.scoring_mode as string) || "seed"} onChange={(e) => void settings({ scoring_mode: e.target.value })}>
              {SCORING_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
            <span style={{ fontSize: "0.78rem", color: status === "error" ? "var(--err, #c0392b)" : "var(--ink-soft)" }}>
              {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Couldn't save" : ""}
            </span>
            <button type="button" className={styles.createBtn} onClick={onClose}>Done</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
