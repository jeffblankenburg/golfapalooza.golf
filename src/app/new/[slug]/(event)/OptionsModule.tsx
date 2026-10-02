"use client";

import { useState } from "react";
import styles from "@/app/new/new.module.css";
import { priceForValue } from "@/lib/v2/options";
import { OptionControl, isEmptyValue, selectionIsActive, dollars, type MemberOption, type MemberGroup } from "./optionControls";

/**
 * Member-facing options (#218). Renders every type (checkbox / select / multi-select /
 * quantity / text / number), grouped by section, respecting dependencies (a dependent
 * option is hidden until its parent is selected). Selecting enrolls into the option's
 * bundled contests server-side. "Your total" is the derived charge preview.
 */
export default function OptionsModule({
  eventId, options, groups, initialSelections, optionsOpen,
}: {
  eventId: string;
  options: MemberOption[];
  groups: MemberGroup[];
  initialSelections: Record<string, unknown>;
  optionsOpen: boolean;
}) {
  const [sel, setSel] = useState<Record<string, unknown>>(initialSelections);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function save(o: MemberOption, value: unknown) {
    const prev = sel[o.id];
    const empty = isEmptyValue(o.option_type, value);
    setSel((s) => { const n = { ...s }; if (empty) delete n[o.id]; else n[o.id] = value; return n; });
    setBusyId(o.id);
    try {
      const url = `/api/v2/events/${eventId}/options/${o.id}/selection`;
      const res = empty
        ? await fetch(url, { method: "DELETE" })
        : await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value }) });
      if (!res.ok) throw new Error();
    } catch {
      setSel((s) => { const n = { ...s }; if (prev === undefined) delete n[o.id]; else n[o.id] = prev; return n; });
    } finally {
      setBusyId(null);
    }
  }

  // Dependency gate: hide a dependent option until its parent option is selected.
  // Purely option-to-option (v1 parity) — no attendance involved.
  const byId = new Map(options.map((o) => [o.id, o]));
  const visible = (o: MemberOption): boolean => {
    if (!o.depends_on_option_id) return true;
    const parent = byId.get(o.depends_on_option_id);
    return parent ? selectionIsActive(parent.option_type, sel[parent.id]) : true;
  };

  const shown = options.filter(visible);
  const total = shown.reduce((s, o) => s + priceForValue(o.option_type, sel[o.id], o.price_info), 0);
  const headPrice = (o: MemberOption) => {
    // Only surface a price when there is one — "Free" is just noise.
    if (o.option_type === "checkbox" && o.price_info.whole) return dollars(o.price_info.whole);
    return ""; // choice types show price per choice below; text/number/free show nothing
  };

  function optionItem(o: MemberOption) {
    return (
      <div key={o.id} className={styles.optItem}>
        <div className={styles.optItemHead}>
          {o.icon && <span aria-hidden style={{ fontSize: "1.1rem" }}>{o.icon}</span>}
          <div className={styles.optMain}>
            <span className={styles.optName}>{o.name}{o.is_required ? " *" : ""}</span>
            {o.description && <span className={styles.optSub}>{o.description}</span>}
          </div>
          <span className={styles.optPrice}>{headPrice(o)}</span>
        </div>
        <div className={styles.optItemControl}>
          <OptionControl option={o} value={sel[o.id]} disabled={busyId === o.id || !optionsOpen} onChange={(val) => save(o, val)} />
        </div>
      </div>
    );
  }

  const ungrouped = shown.filter((o) => !o.group_id || !groups.some((g) => g.id === o.group_id));

  return (
    <div className={styles.module}>
      <div className={styles.moduleHead}><span className={styles.sectionLabel}>Options</span></div>
      <div className={styles.optCard}>
        {!optionsOpen && <p className={styles.roundFormHint} style={{ marginTop: 0, marginBottom: 6 }}>Options are closed.</p>}

        {groups.map((g) => {
          const list = shown.filter((o) => o.group_id === g.id);
          if (list.length === 0) return null;
          return (
            <div key={g.id}>
              <p className={styles.optGroupLabel}>{g.icon ? `${g.icon} ` : ""}{g.name}</p>
              {list.map(optionItem)}
            </div>
          );
        })}

        {ungrouped.length > 0 && (
          <div>
            {groups.length > 0 && <p className={styles.optGroupLabel}>More</p>}
            {ungrouped.map(optionItem)}
          </div>
        )}
        {/* Clearance so the last option isn't hidden behind the floating total bar. */}
        <div aria-hidden style={{ height: 64 }} />
      </div>

      {/* Running total floats above the content + bottom nav, always visible. */}
      <div className={styles.optTotalBar}>
        <span>Your total</span>
        <strong>{dollars(total)}</strong>
      </div>
    </div>
  );
}
