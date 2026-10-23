"use client";

import { useState, useRef } from "react";
import Modal from "@/app/new/_components/Modal";
import { priceForValue, selectedChoiceValues, optionValueIsEmpty, type OptionType, type OptionPriceInfo } from "@/lib/v2/options";
import styles from "@/app/new/new.module.css";

export interface GridChoice { value: string; label: string; }
export interface GridOption {
  id: string;
  name: string;
  option_type: OptionType;
  choices: GridChoice[];
  max_total: number | null;
  price: OptionPriceInfo;
}
export interface GridMember { userId: string; name: string; }

type SelMap = Record<string, Record<string, unknown>>;

function money(cents: number): string {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export default function SelectionGrid({
  orgId,
  eventId,
  options,
  members,
  tripCostCents,
  initialSelections,
}: {
  orgId: string;
  eventId: string;
  options: GridOption[];
  members: GridMember[];
  tripCostCents: number;
  initialSelections: SelMap;
}) {
  const [sel, setSel] = useState<SelMap>(initialSelections);
  const [saving, setSaving] = useState<Set<string>>(new Set());

  const base = `/api/v2/orgs/${orgId}/events/${eventId}/options`;

  async function save(userId: string, opt: GridOption, value: unknown) {
    const key = `${userId}:${opt.id}`;
    const prev = sel[userId]?.[opt.id];
    const empty = optionValueIsEmpty(opt.option_type, value);

    // Optimistic.
    setSel((p) => {
      const next = { ...p, [userId]: { ...(p[userId] || {}) } };
      if (empty) delete next[userId][opt.id];
      else next[userId][opt.id] = value;
      return next;
    });
    setSaving((p) => new Set(p).add(key));

    try {
      const res = await fetch(`${base}/${opt.id}/selection`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, value: empty ? null : value }),
      });
      if (!res.ok) throw new Error("save failed");
    } catch {
      // Revert.
      setSel((p) => {
        const next = { ...p, [userId]: { ...(p[userId] || {}) } };
        if (prev === undefined) delete next[userId][opt.id];
        else next[userId][opt.id] = prev;
        return next;
      });
    } finally {
      setSaving((p) => {
        const n = new Set(p);
        n.delete(key);
        return n;
      });
    }
  }

  function cellCents(opt: GridOption, value: unknown): number {
    if (optionValueIsEmpty(opt.option_type, value)) return 0;
    if (opt.option_type === "trip_cost") return tripCostCents;
    return priceForValue(opt.option_type, value, opt.price);
  }

  // ── Column summary (v1 parity): counts / total+avg / checked count ──
  function columnSummary(opt: GridOption): React.ReactNode {
    if (opt.option_type === "text") return null;

    if (opt.option_type === "number") {
      const vals: number[] = [];
      for (const m of members) {
        const v = sel[m.userId]?.[opt.id];
        if (v == null || v === "") continue;
        const n = Number(v);
        if (!Number.isNaN(n)) vals.push(n);
      }
      if (!vals.length) return null;
      const sum = vals.reduce((a, b) => a + b, 0);
      const avg = sum / vals.length;
      return (
        <>
          <div>Total <b>{sum.toLocaleString()}</b></div>
          {vals.length > 1 && <div>Avg <b>{avg.toFixed(avg % 1 === 0 ? 0 : 1)}</b></div>}
        </>
      );
    }

    if (opt.option_type === "checkbox" || opt.option_type === "trip_cost") {
      let c = 0;
      for (const m of members) if (sel[m.userId]?.[opt.id] === true) c++;
      return <div><b>{c}</b>/{members.length}</div>;
    }

    // select / multi_select / quantity → per-choice counts (summed for quantity)
    const counts = new Map<string, number>(opt.choices.map((c) => [c.value, 0]));
    for (const m of members) {
      const v = sel[m.userId]?.[opt.id];
      if (v == null) continue;
      if (opt.option_type === "quantity" && typeof v === "object" && !Array.isArray(v)) {
        for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
          const num = Number(n);
          if (Number.isFinite(num) && num > 0 && counts.has(k)) counts.set(k, (counts.get(k) || 0) + num);
        }
      } else {
        for (const cv of selectedChoiceValues(opt.option_type, v)) if (counts.has(cv)) counts.set(cv, (counts.get(cv) || 0) + 1);
      }
    }
    const lines = opt.choices.map((c) => ({ label: c.label, n: counts.get(c.value) || 0 })).filter((x) => x.n > 0);
    if (!lines.length) return null;
    return <>{lines.map((l) => <div key={l.label}>{l.label} <b>{l.n}</b></div>)}</>;
  }

  if (members.length === 0 || options.length === 0) {
    return (
      <p className={styles.dnsHint} style={{ marginTop: 18 }}>
        Nothing to show yet. Members appear here once they&apos;re on the roster or pick an option.
      </p>
    );
  }

  // Per-member + per-option + grand totals.
  const optTotal = new Map<string, number>();
  const memberTotal = new Map<string, number>();
  let grand = 0;
  for (const m of members) {
    let mt = 0;
    for (const o of options) {
      const c = cellCents(o, sel[m.userId]?.[o.id]);
      optTotal.set(o.id, (optTotal.get(o.id) || 0) + c);
      mt += c;
    }
    memberTotal.set(m.userId, mt);
    grand += mt;
  }

  return (
    <div className={styles.optGridWrap}>
      <table className={styles.optGrid}>
        <thead>
          <tr>
            <th className={styles.optGridSticky}>Member</th>
            {options.map((o) => <th key={o.id}>{o.name}</th>)}
            <th className={styles.optGridTotal}>Total</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.userId}>
              <td className={styles.optGridSticky}>{m.name}</td>
              {options.map((o) => {
                const v = sel[m.userId]?.[o.id];
                const cents = cellCents(o, v);
                return (
                  <td key={o.id} data-empty={optionValueIsEmpty(o.option_type, v) ? "1" : undefined}>
                    <Cell
                      opt={o}
                      value={v}
                      cents={cents}
                      busy={saving.has(`${m.userId}:${o.id}`)}
                      onChange={(nv) => save(m.userId, o, nv)}
                    />
                  </td>
                );
              })}
              <td className={styles.optGridTotal}>{money(memberTotal.get(m.userId) || 0)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className={styles.optGridSticky}>Totals</td>
            {options.map((o) => (
              <td key={o.id}>
                <div className={styles.optColSummary}>{columnSummary(o)}</div>
                {(optTotal.get(o.id) || 0) > 0 && <div className={styles.optColMoney}>{money(optTotal.get(o.id) || 0)}</div>}
              </td>
            ))}
            <td className={styles.optGridTotal}>{money(grand)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** Label with its price prefixed when the choice costs something: "$15 - I'm in!". */
function withPrice(label: string, cents: number): string {
  return cents > 0 ? `${money(cents)} - ${label}` : label;
}

// ── Editable cell (dispatches by option type) ────────────────────────────
function Cell({ opt, value, cents, busy, onChange }: { opt: GridOption; value: unknown; cents: number; busy: boolean; onChange: (v: unknown) => void }) {
  const dim = busy ? { opacity: 0.5 } : undefined;
  // What a given choice would cost if selected (whole-option cost + its own).
  const choiceCents = (cv: string) => opt.price.whole + (opt.price.byChoice[cv] || 0);

  switch (opt.option_type) {
    case "checkbox":
    case "trip_cost":
      return (
        <label className={styles.optCheckWrap} style={dim}>
          <input type="checkbox" className={styles.optCheck} checked={value === true} onChange={(e) => onChange(e.target.checked)} />
          {cents > 0 && <span className={styles.optInlineCost}>{money(cents)}</span>}
        </label>
      );
    case "select":
      return (
        <select className={styles.optCellInput} style={dim} value={(value as string) || ""} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">—</option>
          {opt.choices.map((c) => <option key={c.value} value={c.value}>{withPrice(c.label, choiceCents(c.value))}</option>)}
        </select>
      );
    case "multi_select": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className={styles.optMulti} style={dim}>
          {opt.choices.map((c) => (
            <label key={c.value} className={styles.optMultiItem}>
              <input
                type="checkbox"
                checked={selected.includes(c.value)}
                onChange={() => {
                  const next = selected.includes(c.value) ? selected.filter((s) => s !== c.value) : [...selected, c.value];
                  onChange(next);
                }}
              />
              {withPrice(c.label, choiceCents(c.value))}
            </label>
          ))}
        </div>
      );
    }
    case "text":
      return <DebouncedInput kind="text" value={(value as string) || ""} dim={dim} onCommit={(v) => onChange(v || null)} />;
    case "number":
      return (
        <span className={styles.optInlineWrap}>
          <DebouncedInput kind="number" value={value != null ? String(value) : ""} dim={dim} onCommit={(v) => onChange(v === "" ? null : Number(v))} />
          {cents > 0 && <span className={styles.optInlineCost}>{money(cents)}</span>}
        </span>
      );
    case "quantity":
      return (
        <span className={styles.optInlineWrap}>
          <QuantityCell opt={opt} value={(value && typeof value === "object" && !Array.isArray(value)) ? (value as Record<string, number>) : {}} dim={dim} onChange={onChange} />
          {cents > 0 && <span className={styles.optInlineCost}>{money(cents)}</span>}
        </span>
      );
    default:
      return <span>—</span>;
  }
}

function DebouncedInput({ kind, value, dim, onCommit }: { kind: "text" | "number"; value: string; dim?: React.CSSProperties; onCommit: (v: string) => void }) {
  const [local, setLocal] = useState(value);
  const [synced, setSynced] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Re-sync to the prop when it changes externally (save revert / refresh) —
  // adjusting state during render, React's sanctioned alternative to an effect.
  if (value !== synced) {
    setSynced(value);
    setLocal(value);
  }
  return (
    <input
      type={kind}
      inputMode={kind === "number" ? "decimal" : undefined}
      className={styles.optCellInput}
      style={dim}
      value={local}
      onChange={(e) => {
        setLocal(e.target.value);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => onCommit(e.target.value), 600);
      }}
      onBlur={() => { if (timer.current) clearTimeout(timer.current); onCommit(local); }}
    />
  );
}

function QuantityCell({ opt, value, dim, onChange }: { opt: GridOption; value: Record<string, number>; dim?: React.CSSProperties; onChange: (v: Record<string, number> | null) => void }) {
  const [open, setOpen] = useState(false);
  const max = opt.max_total;
  const total = Object.values(value).reduce((a, b) => a + (Number(b) || 0), 0);
  const summary = opt.choices.map((c) => ({ label: c.label, n: Number(value[c.value]) || 0 })).filter((x) => x.n > 0);

  function update(cv: string, next: number) {
    const safe = Math.max(0, Math.floor(Number.isFinite(next) ? next : 0));
    const otherSum = total - (Number(value[cv]) || 0);
    const clamped = max != null ? Math.min(safe, Math.max(0, max - otherSum)) : safe;
    const m: Record<string, number> = { ...value };
    if (clamped <= 0) delete m[cv];
    else m[cv] = clamped;
    onChange(Object.keys(m).length ? m : null);
  }

  return (
    <>
      <button type="button" className={styles.optQtyBtn} style={dim} onClick={() => setOpen(true)}>
        {summary.length === 0 ? <span className={styles.optQtyEmpty}>Set</span> : summary.map((s) => `${s.label}×${s.n}`).join(", ")}
        {max != null && <span className={styles.optQtyMax}> ({total}/{max})</span>}
      </button>
      <Modal open={open} title={opt.name} onClose={() => setOpen(false)}>
        <div className={styles.optQtyList}>
          {opt.choices.map((c) => {
            const qty = Number(value[c.value]) || 0;
            const incOff = max != null && total >= max;
            return (
              <div key={c.value} className={styles.optQtyRow} data-on={qty > 0 ? "1" : undefined}>
                <span>{c.label}</span>
                <div className={styles.optQtyStep}>
                  <button type="button" disabled={qty <= 0} onClick={() => update(c.value, qty - 1)}>−</button>
                  <span>{qty}</span>
                  <button type="button" disabled={incOff} onClick={() => update(c.value, qty + 1)}>+</button>
                </div>
              </div>
            );
          })}
        </div>
        <div className={styles.stickyModalAction}>
          <button type="button" className={styles.createBtn} onClick={() => setOpen(false)}>Done</button>
        </div>
      </Modal>
    </>
  );
}
