"use client";

import { useState } from "react";
import Modal from "@/app/new/_components/Modal";
import styles from "@/app/new/new.module.css";

export interface BuilderTee { id: string; tee_name: string; tee_color: string | null; par: number; course_rating: number | null; slope_rating: number | null }

const HOLES = Array.from({ length: 18 }, (_, i) => i + 1);

/** Basis option shows par + rating/slope (the handicap inputs). */
function basisLabel(t: BuilderTee): string {
  const rs = t.course_rating != null && t.slope_rating != null ? `, ${t.course_rating} / ${t.slope_rating}` : "";
  return `${t.tee_name} (Par ${t.par}${rs})`;
}

/**
 * Contest-only custom tee mix (#209). Each hole plays from a chosen source tee
 * (par/yards); handicapping uses a separately-chosen basis tee's rating/slope.
 * This is stored on the CONTEST — it never creates or edits a course tee. Holes
 * default to the basis tee, so you only change the few that differ.
 */
export default function CustomTeeBuilder({
  tees,
  holesByTee,
  initialBasis,
  initialHoles,
  onSave,
  onCancel,
}: {
  tees: BuilderTee[];
  holesByTee: Record<string, { hole_number: number; handicap_index: number; par: number }[]>;
  initialBasis: string | null;
  initialHoles: Record<number, string> | null;
  onSave: (basis: string, holes: Record<number, string>) => void;
  onCancel: () => void;
}) {
  // Hole handicap (stroke index) for a hole, read from the tee it plays from.
  const hcpFor = (teeId: string, hole: number) =>
    holesByTee[teeId]?.find((h) => h.hole_number === hole)?.handicap_index ?? null;
  const defaultBasis = initialBasis || tees[0]?.id || "";
  const [basis, setBasis] = useState(defaultBasis);
  const [holes, setHoles] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {};
    for (const n of HOLES) init[n] = initialHoles?.[n] || defaultBasis;
    return init;
  });

  function resetAllToBasis() {
    setHoles(Object.fromEntries(HOLES.map((n) => [n, basis])));
  }

  return (
    <Modal open title="Custom Tees" onClose={onCancel}>
      <div className={styles.field}>
        <label className={styles.label}>Handicap basis <span className={styles.optional}>(rating / slope)</span></label>
        <select className={styles.roleSelect} value={basis} onChange={(e) => setBasis(e.target.value)}>
          {tees.map((t) => (
            <option key={t.id} value={t.id}>{basisLabel(t)}</option>
          ))}
        </select>
      </div>

      <div className={styles.customTeeHead}>
        <span className={styles.teamMetaLabel}>Per hole</span>
        <button type="button" className={styles.linkAction} onClick={resetAllToBasis}>Reset all to basis</button>
      </div>

      <div className={styles.customTeeColHead}>
        <span className={styles.customTeeHole}>Hole</span>
        <span className={styles.customTeeHcp}>Hcp</span>
        <span className={styles.customTeeTeeLabel}>Tee</span>
      </div>

      <div className={styles.customTeeGrid}>
        {HOLES.map((n) => (
          <div key={n} className={styles.customTeeRow}>
            <span className={styles.customTeeHole}>{n}</span>
            <span className={styles.customTeeHcp}>{hcpFor(holes[n] || basis, n) ?? "—"}</span>
            <select
              className={styles.roleSelect}
              value={holes[n] || basis}
              onChange={(e) => setHoles((prev) => ({ ...prev, [n]: e.target.value }))}
            >
              {tees.map((t) => (
                <option key={t.id} value={t.id}>{t.tee_name}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <button type="button" className={styles.createBtn} style={{ marginTop: 16 }} onClick={() => onSave(basis, holes)} disabled={!basis}>
        Save custom tees
      </button>
    </Modal>
  );
}
