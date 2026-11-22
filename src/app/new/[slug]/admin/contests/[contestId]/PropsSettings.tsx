"use client";

import { useEffect, useState } from "react";
import Modal from "@/app/new/_components/Modal";
import styles from "@/app/new/new.module.css";
import PayoutSplitsEditor from "../../events/[eventId]/contests/[contestId]/PayoutSplitsEditor";
import type { PayoutSplit } from "@/lib/v2/contests/payouts";
import { NUMERIC_RULES, type NumericRule } from "@/lib/v2/contests/props";
import ZonedDateTimeField from "@/app/new/_components/ZonedDateTimeField";

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: cents % 100 === 0 ? 0 : 2 })}`;
const LABEL = { display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: 4 } as const;

/**
 * Props contest settings (name, status, lock, numeric rule, buy-in, payouts) in a
 * modal opened from the contest CARD — so the detail page stays focused on authoring
 * questions + entering results. Self-fetches the current settings on open and
 * auto-saves each field through the generic contest PATCH, so it drops onto any card
 * (group or event lane) with just the API base + timezone.
 */
export default function PropsSettings({ open, apiBase, timeZone, onClose, onSaved }: {
  open: boolean;
  apiBase: string;            // /api/v2/orgs/<org>/contests/<contest>
  timeZone: string;
  onClose: () => void;
  onSaved?: () => void;       // let the list refresh (card meta reflects changes)
}) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [initialName, setInitialName] = useState("");
  const [status, setStatus] = useState("draft");
  const [locksAt, setLocksAt] = useState<string | null>(null);
  const [rule, setRule] = useState<NumericRule>("absolute");
  const [fee, setFee] = useState("");
  const [splits, setSplits] = useState<PayoutSplit[]>([]);
  const [participantCount, setParticipantCount] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true); setErr(null); setSavedAt(null);
    (async () => {
      try {
        const res = await fetch(apiBase);
        if (!res.ok) throw new Error();
        const d = await res.json();
        if (cancelled) return;
        setName(d.name || ""); setInitialName(d.name || "");
        setStatus(d.status || "draft");
        setLocksAt(d.locksAt ?? null);
        setRule((d.numericRule as NumericRule) || "absolute");
        setFee(d.entryCents ? String(d.entryCents / 100) : "");
        setSplits((d.payoutSplits as PayoutSplit[]) || []);
        setParticipantCount(d.participantCount || 0);
      } catch {
        if (!cancelled) setErr("Could not load settings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, apiBase, timeZone]);

  const feeCents = Math.round((Number(fee) || 0) * 100);
  const pot = feeCents * participantCount;

  async function save(patch: Record<string, unknown>) {
    setErr(null);
    const res = await fetch(apiBase, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error || "Could not save"); return; }
    setSavedAt(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
    onSaved?.();
  }

  return (
    <Modal open={open} title="Props settings" onClose={onClose}>
      {loading ? (
        <p className={styles.roundFormHint} style={{ margin: 0 }}>Loading…</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label><span style={LABEL}>Name</span>
            <input className={styles.input} style={{ width: "100%" }} value={name} maxLength={80}
              onChange={(e) => setName(e.target.value)} onBlur={() => { if (name.trim() && name !== initialName) { setInitialName(name.trim()); void save({ name: name.trim() }); } }} />
          </label>
          <label><span style={LABEL}>Status</span>
            <select className={styles.selectInput} value={status} onChange={(e) => { setStatus(e.target.value); void save({ status: e.target.value }); }}>
              <option value="draft">Draft (hidden from members)</option>
              <option value="active">Open (members can answer)</option>
              <option value="final">Final (closed)</option>
            </select>
          </label>
          <ZonedDateTimeField label="Answers lock at" value={locksAt} timeZone={timeZone}
            onChange={(iso) => { setLocksAt(iso); void save({ locks_at: iso }); }} />
          <label><span style={LABEL}>Default numeric scoring</span>
            <select className={styles.selectInput} value={rule} onChange={(e) => { setRule(e.target.value as NumericRule); void save({ numeric_rule: e.target.value }); }}>
              {NUMERIC_RULES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <p className={styles.roundFormHint} style={{ marginTop: 4 }}>{NUMERIC_RULES.find((r) => r.value === rule)?.hint}</p>
          </label>
          <label><span style={LABEL}>Buy-in <span style={{ fontWeight: 400, color: "var(--ink-soft)" }}>(per player, optional)</span></span>
            <span style={{ position: "relative", display: "block", maxWidth: 160 }}>
              <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--ink-soft)", pointerEvents: "none" }}>$</span>
              <input className={styles.input} style={{ width: "100%", paddingLeft: 26 }} inputMode="decimal" value={fee} placeholder="0"
                onChange={(e) => setFee(e.target.value.replace(/[^0-9.]/g, ""))} onBlur={() => void save({ entry_cents: feeCents })} />
            </span>
          </label>
          <div>
            <span style={LABEL}>Payouts <span style={{ fontWeight: 400, color: "var(--ink-soft)" }}>(share of the pot by place)</span></span>
            <PayoutSplitsEditor value={splits} onSave={(s) => { setSplits(s); void save({ payout_splits: s }); }} />
            {feeCents > 0 && (
              <p className={styles.roundFormHint} style={{ marginTop: 6 }}>
                Pot: {money(feeCents)} × {participantCount} in = <strong style={{ color: "var(--brand)" }}>{money(pot)}</strong>
              </p>
            )}
          </div>
          {err && <p className={styles.err} style={{ margin: 0 }}>{err}</p>}
          {savedAt && <p className={styles.roundFormHint} style={{ margin: 0 }}>Saved {savedAt}.</p>}
        </div>
      )}
    </Modal>
  );
}
