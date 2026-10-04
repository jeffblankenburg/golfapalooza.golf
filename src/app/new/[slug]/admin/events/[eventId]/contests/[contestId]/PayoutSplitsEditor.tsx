"use client";

import { Fragment, useEffect, useState } from "react";
import styles from "@/app/new/new.module.css";
import type { PayoutSplit } from "@/lib/v2/contests/payouts";

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

const KINDS = [
  { value: "percentage", label: "% of pot" },
  { value: "flat", label: "$ amount" },
  { value: "remainder", label: "Remainder" },
  { value: "single_winner", label: "Winner takes all" },
] as const;

/**
 * Shared editor for a contest's payout splits per place (v1 parity: %, flat $, remainder,
 * winner-takes-all). Self-contained: edits locally, commits on change/blur via onSave.
 * Place is the row position. `amount` is a percent for "percentage" and DOLLARS for "flat".
 */
export default function PayoutSplitsEditor({ value, onSave, disabled }: {
  value: PayoutSplit[];
  onSave: (next: PayoutSplit[]) => void;
  disabled?: boolean;
}) {
  const [rows, setRows] = useState<PayoutSplit[]>(value);
  useEffect(() => { setRows(value); }, [value]);

  // Always keep place = position; commit the re-numbered array.
  const commit = (next: PayoutSplit[]) => {
    const numbered = next.map((r, i) => ({ ...r, place: i + 1 }));
    setRows(numbered);
    onSave(numbered);
  };
  const pctTotal = rows.filter((r) => r.kind === "percentage").reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const hasRemainder = rows.some((r) => r.kind === "remainder");

  const inputSize = { fontSize: "0.85rem", padding: "6px 8px" } as const;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "28px minmax(0, 1fr) 96px 28px", alignItems: "center", columnGap: 8, rowGap: 6 }}>
        {rows.map((r, i) => (
          <Fragment key={i}>
            <span style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>{ordinal(i + 1)}</span>
            <select className={styles.selectInput} style={{ width: "100%", minWidth: 0, ...inputSize }} value={r.kind} disabled={disabled}
              onChange={(e) => commit(rows.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))}>
              {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
            {r.kind === "percentage" || r.kind === "flat" ? (
              <div style={{ position: "relative", width: "100%", justifySelf: "end" }}>
                {r.kind === "flat" && <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--ink-soft)", fontSize: "0.85rem", pointerEvents: "none" }}>$</span>}
                <input className={styles.input} inputMode="decimal" disabled={disabled}
                  style={{ width: "100%", textAlign: "right", ...inputSize, paddingLeft: r.kind === "flat" ? 20 : 8, paddingRight: r.kind === "percentage" ? 22 : 8 }}
                  value={r.amount ?? ""}
                  onChange={(e) => setRows((s) => s.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 } : x)))}
                  onBlur={() => commit(rows)} />
                {r.kind === "percentage" && <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: "var(--ink-soft)", fontSize: "0.85rem", pointerEvents: "none" }}>%</span>}
              </div>
            ) : (
              <span style={{ justifySelf: "end", color: "var(--ink-soft)", fontSize: "0.8rem" }}>{r.kind === "remainder" ? "the rest" : "whole pot"}</span>
            )}
            <button type="button" className={styles.iconDelBtn} aria-label="Remove place" disabled={disabled} style={{ justifySelf: "center" }}
              onClick={() => commit(rows.filter((_, j) => j !== i))}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a1 1 0 01-1 1H7a1 1 0 01-1-1V6M10 11v6M14 11v6" /></svg>
            </button>
          </Fragment>
        ))}
      </div>
      <button type="button" className={styles.createBtnGhost} disabled={disabled} style={{ marginTop: 8, padding: "7px 10px", fontSize: "0.85rem" }}
        onClick={() => commit([...rows, { place: rows.length + 1, kind: "percentage", amount: 0 }])}>+ Add place</button>
      {rows.some((r) => r.kind === "percentage") && !hasRemainder && pctTotal !== 100 && (
        <p className={styles.roundFormHint} style={{ color: pctTotal > 100 ? "var(--warn, #c2410c)" : undefined }}>Percentages total {pctTotal}% (add a Remainder place or reach 100%).</p>
      )}
    </div>
  );
}
