"use client";

import { useState } from "react";
import { ConfirmModal } from "@/components/admin/ConfirmModal";

interface HoleData {
  hole_number: number;
  par: number;
  handicap_index: number;
  yards: number | null;
}

interface HoleEditorProps {
  courseId: string;
  teeId: string;
  holes: HoleData[];
  onSaved: () => void;
}

export default function HoleEditor({ courseId, teeId, holes, onSaved }: HoleEditorProps) {
  const [editHoles, setEditHoles] = useState<HoleData[]>(
    holes.map((h) => ({ ...h }))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [confirmedWarnings, setConfirmedWarnings] = useState(false);

  function updateHole(index: number, field: keyof HoleData, value: number | null) {
    setEditHoles((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    setConfirmedWarnings(false);
  }

  const is18 = editHoles.length > 9;
  const frontNine = editHoles.filter((h) => h.hole_number <= 9);
  const backNine = editHoles.filter((h) => h.hole_number > 9);
  const frontPar = frontNine.reduce((sum, h) => sum + h.par, 0);
  const backPar = backNine.reduce((sum, h) => sum + h.par, 0);
  const totalPar = frontPar + backPar;
  const frontYards = frontNine.reduce((sum, h) => sum + (h.yards || 0), 0);
  const backYards = backNine.reduce((sum, h) => sum + (h.yards || 0), 0);

  // Validation
  function validate(): { errors: string[]; warnings: string[] } {
    const errs: string[] = [];
    const warns: string[] = [];

    // Check duplicate handicaps
    const hdcps = editHoles.map((h) => h.handicap_index);
    const seen = new Set<number>();
    const dupes = new Set<number>();
    for (const h of hdcps) {
      if (seen.has(h)) dupes.add(h);
      seen.add(h);
    }
    if (dupes.size > 0) {
      errs.push(`Duplicate handicap values: ${[...dupes].sort((a, b) => a - b).join(", ")}. Each hole must have a unique handicap.`);
    }

    // Check handicap range (DB constraint: 1-18)
    const outOfRange = editHoles.filter((h) => h.handicap_index < 1 || h.handicap_index > 18);
    if (outOfRange.length > 0) {
      errs.push(`Handicap must be between 1 and 18. Hole${outOfRange.length > 1 ? "s" : ""} ${outOfRange.map((h) => h.hole_number).join(", ")} out of range.`);
    }

    // Check par range (DB constraint: 3-6)
    const badPar = editHoles.filter((h) => h.par < 3 || h.par > 6);
    if (badPar.length > 0) {
      errs.push(`Par must be between 3 and 6. Hole${badPar.length > 1 ? "s" : ""} ${badPar.map((h) => h.hole_number).join(", ")} out of range.`);
    }

    // Check par totals
    if (is18) {
      if (frontPar !== 36) {
        warns.push(`Front 9 par is ${frontPar} (typical is 36)`);
      }
      if (backPar !== 36) {
        warns.push(`Back 9 par is ${backPar} (typical is 36)`);
      }
    } else {
      if (totalPar !== 36) {
        warns.push(`Total par is ${totalPar} (typical 9-hole par is 36)`);
      }
    }

    return { errors: errs, warnings: warns };
  }

  async function doSave() {
    setSaving(true);
    setError("");
    setWarnings([]);

    const res = await fetch(`/api/courses/${courseId}/tees/${teeId}/holes`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holes: editHoles }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => null);
      setError(errData?.error || "Failed to save holes");
      setSaving(false);
      return;
    }

    // Update tee's total_yards and par from hole data
    const yardSum = editHoles.reduce((sum, h) => sum + (h.yards || 0), 0);
    const parSum = editHoles.reduce((sum, h) => sum + h.par, 0);
    await fetch(`/api/courses/${courseId}/tees`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tee_id: teeId,
        total_yards: yardSum > 0 ? yardSum : null,
        par: parSum,
      }),
    });

    setSaving(false);
    onSaved();
  }

  async function handleSave() {
    const { errors: errs, warnings: warns } = validate();

    if (errs.length > 0) {
      setError(errs.join(" "));
      setWarnings([]);
      return;
    }

    if (warns.length > 0 && !confirmedWarnings) {
      setWarnings(warns);
      setError("");
      return;
    }

    await doSave();
  }

  // Tab index: column-first ordering
  // Par column: 1..N, Hdcp column: N+1..2N, Yards column: 2N+1..3N
  const holeCount = editHoles.length;
  function tabIdx(holeIndex: number, column: number): number {
    return column * holeCount + holeIndex + 1;
  }

  function renderNine(nineHoles: HoleData[], label: string, parTotal: number, yardsTotal: number) {
    return (
      <div className="mb-4">
        <div className="text-xs font-semibold text-gray-500 mb-2">{label}</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 border-b border-gray-200">
              <th className="text-left py-1.5 pr-1 font-medium w-10">Hole</th>
              <th className="text-center py-1.5 font-medium">Par</th>
              <th className="text-center py-1.5 font-medium">Hdcp</th>
              <th className="text-center py-1.5 font-medium">Yards</th>
            </tr>
          </thead>
          <tbody>
            {nineHoles.map((hole) => {
              const idx = editHoles.findIndex((h) => h.hole_number === hole.hole_number);
              const hdcpDuplicate = editHoles.some(
                (h) => h.hole_number !== hole.hole_number && h.handicap_index === hole.handicap_index
              );
              return (
                <tr key={hole.hole_number} className="border-b border-gray-100">
                  <td className="py-1 pr-1 font-medium text-gray-700">{hole.hole_number}</td>
                  <td className="py-1 px-0.5">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={3}
                      max={6}
                      value={hole.par}
                      onChange={(e) => {
                        const v = parseInt(e.target.value);
                        if (!isNaN(v)) updateHole(idx, "par", v);
                      }}
                      tabIndex={tabIdx(idx, 0)}
                      className="w-full text-center bg-white border border-gray-200 rounded px-1 py-1.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </td>
                  <td className="py-1 px-0.5">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={18}
                      value={hole.handicap_index}
                      onChange={(e) => {
                        const v = parseInt(e.target.value);
                        if (!isNaN(v)) updateHole(idx, "handicap_index", v);
                      }}
                      tabIndex={tabIdx(idx, 1)}
                      className={`w-full text-center bg-white border rounded px-1 py-1.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                        hdcpDuplicate ? "border-red-400 bg-red-50" : "border-gray-200"
                      }`}
                    />
                  </td>
                  <td className="py-1 px-0.5">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={hole.yards ?? ""}
                      onChange={(e) => updateHole(idx, "yards", e.target.value ? parseInt(e.target.value) : null)}
                      tabIndex={tabIdx(idx, 2)}
                      className="w-full text-center bg-white border border-gray-200 rounded px-1 py-1.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      placeholder="—"
                    />
                  </td>
                </tr>
              );
            })}
            <tr className="font-medium text-gray-700 bg-gray-50">
              <td className="py-1.5 pr-1">
                {label.includes("Front") ? "Out" : "In"}
              </td>
              <td className={`py-1.5 text-center ${
                (is18 && parTotal !== 36) ? "text-amber-600" : ""
              }`}>
                {parTotal}
              </td>
              <td className="py-1.5 text-center"></td>
              <td className="py-1.5 text-center">{yardsTotal || "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error && (
        <div className="bg-red-50 text-red-700 px-3 py-2 rounded text-sm">{error}</div>
      )}

      <ConfirmModal
        open={warnings.length > 0 && !confirmedWarnings}
        title="Are you sure?"
        message={warnings.join(". ") + ". Do you want to save anyway?"}
        confirmLabel="Yes, save anyway"
        cancelLabel="Go back and fix"
        onConfirm={() => {
          setConfirmedWarnings(true);
          setWarnings([]);
          doSave();
        }}
        onCancel={() => setWarnings([])}
      />

      {frontNine.length > 0 && renderNine(frontNine, "Front 9", frontPar, frontYards)}
      {backNine.length > 0 && renderNine(backNine, "Back 9", backPar, backYards)}

      {is18 && (
        <div className={`flex justify-between text-sm font-medium rounded-lg px-3 py-2 ${
          totalPar !== 72 ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-700"
        }`}>
          <span>Total</span>
          <span>Par {totalPar} · {frontYards + backYards || "—"} yds</span>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-2.5 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
      >
        {saving ? "Saving..." : "Save Holes"}
      </button>
    </div>
  );
}
