"use client";

import styles from "@/app/new/new.module.css";
import { optionValueIsEmpty, selectionIsActive, type OptionType, type OptionChoice, type OptionPriceInfo } from "@/lib/v2/options";

// Re-export the pure helpers (defined in the server-safe options lib) under the names
// this module's consumers use, so client components can import them from here.
export const isEmptyValue = optionValueIsEmpty;
export { selectionIsActive };

export interface MemberOption {
  id: string;
  name: string;
  description: string | null;
  option_type: OptionType;
  choices: OptionChoice[] | null;
  is_required: boolean;
  max_total: number | null;
  icon: string | null;
  group_id: string | null;
  depends_on_option_id: string | null;
  allow_none?: boolean;       // show an admin-authored "none" opt-out (quantity)
  none_label?: string | null; // its label (defaults to "I'm not having any")
  price_info: OptionPriceInfo;
}
export interface MemberGroup { id: string; name: string; icon: string | null }

export function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** The per-type control for one option. Decoupled from persistence: calls onChange
 *  with the new value; the parent saves. `disabled` locks it (closed / read-only). */
export function OptionControl({ option: o, value: v, disabled, onChange }: {
  option: MemberOption; value: unknown; disabled: boolean; onChange: (v: unknown) => void;
}) {
  switch (o.option_type) {
    // Binary → a toggle switch (v1 parity).
    case "checkbox": {
      const on = v === true;
      return (
        <button type="button" className={styles.optChoiceRow} data-on={on || undefined} disabled={disabled} onClick={() => onChange(on ? false : true)}>
          <span className={styles.optChoiceLabel}>{on ? "Selected" : "Tap to select"}</span>
          <span className={styles.optSwitch} data-on={on || undefined} aria-hidden><span className={styles.optSwitchKnob} /></span>
        </button>
      );
    }
    // Single choice → radio buttons (v1 parity).
    case "select":
      return (
        <div className={styles.optChoiceList}>
          {(o.choices || []).map((c) => {
            const on = v === c.value;
            const p = o.price_info.byChoice[c.value] || 0;
            return (
              <button key={c.value} type="button" className={styles.optChoiceRow} data-on={on || undefined} disabled={disabled}
                onClick={() => onChange(on ? "" : c.value)}>
                <span className={styles.optChoiceMain}>
                  <span className={styles.optRadio} data-on={on || undefined} aria-hidden />
                  <span className={styles.optChoiceLabel}>{c.label}</span>
                </span>
                {p ? <span className={styles.optChoicePrice}>{dollars(p)}</span> : null}
              </button>
            );
          })}
        </div>
      );
    // Many choices → checkboxes (v1 parity).
    case "multi_select": {
      const arr = Array.isArray(v) ? (v as string[]) : [];
      return (
        <div className={styles.optChoiceList}>
          {(o.choices || []).map((c) => {
            const on = arr.includes(c.value);
            const p = o.price_info.byChoice[c.value] || 0;
            return (
              <button key={c.value} type="button" className={styles.optChoiceRow} data-on={on || undefined} disabled={disabled}
                onClick={() => onChange(on ? arr.filter((x) => x !== c.value) : [...arr, c.value])}>
                <span className={styles.optChoiceMain}>
                  <span className={styles.optCheckbox} data-on={on || undefined} aria-hidden>
                    {on && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>}
                  </span>
                  <span className={styles.optChoiceLabel}>{c.label}</span>
                </span>
                {p ? <span className={styles.optChoicePrice}>{dollars(p)}</span> : null}
              </button>
            );
          })}
        </div>
      );
    }
    case "quantity": {
      const obj = (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, number>) : {});
      const sum = Object.values(obj).reduce((s, n) => s + Number(n || 0), 0);
      const atMax = o.max_total != null && sum >= o.max_total;
      // Setting a choice's count: drop zero keys; no positive keys left → unanswered (null).
      const setQty = (cv: string, next: number) => {
        const nextObj = { ...obj };
        if (next <= 0) delete nextObj[cv]; else nextObj[cv] = next;
        onChange(Object.values(nextObj).some((n) => Number(n) > 0) ? nextObj : null);
      };
      // Answered "none": a present object that sums to 0 (the opt-out below).
      const optedNone = v !== null && v !== undefined && typeof v === "object" && !Array.isArray(v) && sum === 0;
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(o.choices || []).map((c) => {
            const qty = Number(obj[c.value] || 0);
            const per = o.price_info.byChoice[c.value] || 0;
            return (
              <div key={c.value} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ flex: 1 }}>{c.label}{per ? ` (${dollars(per)} each)` : ""}</span>
                <button type="button" className={styles.stepBtn} data-kind="minor" disabled={disabled || optedNone || qty <= 0} onClick={() => setQty(c.value, qty - 1)} aria-label="Less"><span className={styles.stepGlyph}>−</span></button>
                <span className={styles.teamStepperVal} style={{ minWidth: 20, textAlign: "center" }}>{qty}</span>
                <button type="button" className={styles.stepBtn} data-kind="minor" disabled={disabled || optedNone || atMax} onClick={() => setQty(c.value, qty + 1)} aria-label="More"><span className={styles.stepGlyph}>+</span></button>
              </div>
            );
          })}
          {o.max_total != null && <p className={styles.roundFormHint}>Up to {o.max_total} total.</p>}
          {/* Admin-authored opt-out so "none" is a valid answer (label is configurable). */}
          {o.allow_none && (
            <button type="button" className={styles.optChoiceRow} data-on={optedNone || undefined} disabled={disabled}
              onClick={() => onChange(optedNone ? null : {})}>
              <span className={styles.optChoiceMain}>
                <span className={styles.optCheckbox} data-on={optedNone || undefined} aria-hidden>
                  {optedNone && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>}
                </span>
                <span className={styles.optChoiceLabel}>{o.none_label?.trim() || "No, thank you"}</span>
              </span>
            </button>
          )}
        </div>
      );
    }
    case "text":
      return (
        <input className={styles.input} defaultValue={typeof v === "string" ? v : ""} disabled={disabled} placeholder="Your answer"
          onBlur={(e) => { const t = e.target.value; if (t !== (typeof v === "string" ? v : "")) onChange(t); }} />
      );
    case "number":
      return (
        <input className={styles.input} type="number" defaultValue={typeof v === "number" ? String(v) : ""} disabled={disabled} placeholder="0"
          onBlur={(e) => { const n = e.target.value === "" ? "" : Number(e.target.value); if (n !== v) onChange(n); }} />
      );
    default:
      return null;
  }
}
