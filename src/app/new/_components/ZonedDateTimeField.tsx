"use client";

import type { ReactNode } from "react";
import { isoToZonedInput, zonedInputToIso, tzLongName } from "@/lib/v2/timezone";
import styles from "@/app/new/new.module.css";

/**
 * The ONE date+time control for the admin app. Takes/returns a stored UTC instant
 * (ISO string, or null when empty) and renders a native datetime-local whose
 * wall-clock is always the given zone — labeled with the DST-agnostic zone name
 * ("Eastern Time") so an admin in any zone enters/reads the event's local time.
 *
 * Every "lock / close / kickoff / publish at" field should use this instead of
 * hand-rolling an <input type="datetime-local">, so they stay identical everywhere.
 */
export default function ZonedDateTimeField({
  label, value, timeZone, onChange, optional = false, hint, id, disabled = false,
  inputClassName, labelClassName,
}: {
  label: string;
  value: string | null;                 // stored ISO instant, or null
  timeZone: string;
  onChange: (iso: string | null) => void;
  optional?: boolean;
  hint?: ReactNode;
  id?: string;
  disabled?: boolean;
  // Override the input/label classes so the field blends into a host form's own
  // styling (e.g. the Squares editor's module) instead of the default new.module.css.
  inputClassName?: string;
  labelClassName?: string;
}) {
  const zoneName = tzLongName(timeZone);
  return (
    <div className={styles.field}>
      <label className={labelClassName ?? styles.label} htmlFor={id}>
        {label}{optional ? " (optional)" : ""}
        {zoneName && <span style={{ fontWeight: 400, color: "var(--ink-soft)" }}> ({zoneName})</span>}
      </label>
      <input
        id={id}
        type="datetime-local"
        className={inputClassName ?? styles.input}
        style={{ width: "100%" }}
        disabled={disabled}
        value={isoToZonedInput(value, timeZone)}
        onChange={(e) => onChange(zonedInputToIso(e.target.value, timeZone))}
      />
      {hint && <p className={styles.roundFormHint} style={{ marginTop: 4 }}>{hint}</p>}
    </div>
  );
}
