"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { DragHandle } from "@/components/DragHandle";
import { getTeeDotStyle } from "@/lib/utils/tee-colors";

export interface EditorHole {
  hole_number: number;
  par: number;
  handicap_index: number;
}

export interface EditorTee {
  id: string;
  tee_name: string | null;
  tee_color: string | null;
  course_rating: number | null;
  slope_rating: number | null;
  par: number | null;
}

export interface EditorPlayer {
  round_player_id: string;
  display_name: string;
  initial_tee_id: string;
  scores: Record<number, { strokes: number | null; putts: number | null }>;
}

export interface RoundEditorProps {
  roundId: string;
  initialRoundDate: string;
  roundType: string;
  courseName: string;
  holes: EditorHole[];
  availableTees: EditorTee[];
  players: EditorPlayer[];
}

type PlayerEditState = {
  tee_id: string;
  scores: Record<number, { strokes: number | null; putts: number | null }>;
};

export default function RoundEditor({
  roundId,
  initialRoundDate,
  roundType,
  courseName,
  holes,
  availableTees,
  players,
}: RoundEditorProps) {
  const router = useRouter();
  const [roundDate, setRoundDate] = useState(initialRoundDate);
  const [editing, setEditing] = useState<{ playerId: string; holeNumber: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [playerState, setPlayerState] = useState<Record<string, PlayerEditState>>(() => {
    const map: Record<string, PlayerEditState> = {};
    for (const p of players) {
      map[p.round_player_id] = {
        tee_id: p.initial_tee_id,
        scores: { ...p.scores },
      };
    }
    return map;
  });

  const visibleHoles = useMemo(() => {
    return holes.filter((h) => {
      if (roundType === "9-front") return h.hole_number <= 9;
      if (roundType === "9-back") return h.hole_number > 9;
      return true;
    });
  }, [holes, roundType]);

  const dirty = useMemo(() => {
    if (roundDate !== initialRoundDate) return true;
    for (const p of players) {
      const state = playerState[p.round_player_id];
      if (!state) continue;
      if (state.tee_id !== p.initial_tee_id) return true;
      for (const h of visibleHoles) {
        const before = p.scores[h.hole_number];
        const after = state.scores[h.hole_number];
        if ((before?.strokes ?? null) !== (after?.strokes ?? null)) return true;
        if ((before?.putts ?? null) !== (after?.putts ?? null)) return true;
      }
    }
    return false;
  }, [roundDate, initialRoundDate, players, playerState, visibleHoles]);

  function updateScore(playerId: string, holeNumber: number, patch: { strokes?: number | null; putts?: number | null }) {
    setPlayerState((prev) => {
      const cur = prev[playerId];
      if (!cur) return prev;
      const curScore = cur.scores[holeNumber] ?? { strokes: null, putts: null };
      return {
        ...prev,
        [playerId]: {
          ...cur,
          scores: {
            ...cur.scores,
            [holeNumber]: {
              strokes: patch.strokes !== undefined ? patch.strokes : curScore.strokes,
              putts: patch.putts !== undefined ? patch.putts : curScore.putts,
            },
          },
        },
      };
    });
  }

  function updateTee(playerId: string, teeId: string) {
    setPlayerState((prev) => {
      const cur = prev[playerId];
      if (!cur) return prev;
      return { ...prev, [playerId]: { ...cur, tee_id: teeId } };
    });
  }

  async function handleSave() {
    setError(null);
    setSaving(true);

    const payload: {
      round_date?: string;
      player_tees?: { round_player_id: string; tee_id: string }[];
      player_scores?: { round_player_id: string; scores: { hole_number: number; strokes: number; putts: number | null }[] }[];
    } = {};

    if (roundDate !== initialRoundDate) {
      payload.round_date = roundDate;
    }

    const teeChanges: { round_player_id: string; tee_id: string }[] = [];
    const scoreChanges: { round_player_id: string; scores: { hole_number: number; strokes: number; putts: number | null }[] }[] = [];

    for (const p of players) {
      const state = playerState[p.round_player_id];
      if (!state) continue;
      if (state.tee_id !== p.initial_tee_id) {
        teeChanges.push({ round_player_id: p.round_player_id, tee_id: state.tee_id });
      }
      const changedRows: { hole_number: number; strokes: number; putts: number | null }[] = [];
      for (const h of visibleHoles) {
        const before = p.scores[h.hole_number];
        const after = state.scores[h.hole_number];
        const beforeStrokes = before?.strokes ?? null;
        const afterStrokes = after?.strokes ?? null;
        const beforePutts = before?.putts ?? null;
        const afterPutts = after?.putts ?? null;
        if (beforeStrokes !== afterStrokes || beforePutts !== afterPutts) {
          if (afterStrokes == null) continue; // we don't support clearing strokes via this endpoint
          changedRows.push({
            hole_number: h.hole_number,
            strokes: afterStrokes,
            putts: afterPutts,
          });
        }
      }
      if (changedRows.length > 0) {
        scoreChanges.push({ round_player_id: p.round_player_id, scores: changedRows });
      }
    }

    if (teeChanges.length > 0) payload.player_tees = teeChanges;
    if (scoreChanges.length > 0) payload.player_scores = scoreChanges;

    try {
      const res = await fetch(`/api/rounds/${roundId}/edit`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Save failed");
      }
      router.push(`/my-rounds/rounds/${roundId}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setSaving(false);
    }
  }

  const currentEditingPlayer = editing ? players.find((p) => p.round_player_id === editing.playerId) : null;
  const currentEditingHole = editing ? visibleHoles.find((h) => h.hole_number === editing.holeNumber) : null;
  const currentEditingState = editing ? playerState[editing.playerId]?.scores[editing.holeNumber] : null;

  return (
    <div className="px-4 py-4 pb-32 max-w-lg mx-auto">
      {/* Round-level metadata */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Round Details
        </h2>
        <p className="text-sm text-gray-700 mb-3 truncate">{courseName}</p>
        <label className="block">
          <span className="text-xs text-gray-500">Date played</span>
          <input
            type="date"
            value={roundDate}
            onChange={(e) => setRoundDate(e.target.value)}
            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none"
          />
        </label>
      </div>

      {/* Per-player blocks */}
      {players.map((p) => {
        const state = playerState[p.round_player_id];
        if (!state) return null;
        const currentTee = availableTees.find((t) => t.id === state.tee_id);
        const teeDot = getTeeDotStyle(currentTee?.tee_color ?? null);

        return (
          <div key={p.round_player_id} className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-900 truncate">{p.display_name}</span>
            </div>

            <label className="block mb-4">
              <span className="text-xs text-gray-500">Tee box</span>
              <div className="mt-1 flex items-center gap-2">
                <span
                  className={`w-3 h-3 rounded-full inline-block flex-shrink-0 ${teeDot.className || ""}`}
                  style={teeDot.style}
                />
                <select
                  value={state.tee_id}
                  onChange={(e) => updateTee(p.round_player_id, e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none"
                >
                  {availableTees.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.tee_name || "Tee"}
                      {t.course_rating && t.slope_rating
                        ? ` — ${t.course_rating}/${t.slope_rating}`
                        : ""}
                    </option>
                  ))}
                </select>
              </div>
            </label>

            <div>
              <p className="text-xs text-gray-500 mb-2">Tap a hole to edit strokes &amp; putts</p>
              <HoleGrid
                visibleHoles={visibleHoles}
                scores={state.scores}
                onTap={(holeNumber) => setEditing({ playerId: p.round_player_id, holeNumber })}
              />
            </div>
          </div>
        );
      })}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mb-3">
          {error}
        </div>
      )}

      {/* Sticky save bar */}
      <div className="fixed bottom-16 left-0 right-0 px-4 py-3 bg-white/95 backdrop-blur border-t border-gray-200">
        <div className="max-w-lg mx-auto flex gap-2">
          <button
            type="button"
            onClick={() => router.push(`/my-rounds/rounds/${roundId}`)}
            disabled={saving}
            className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 font-semibold active:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={!dirty || saving}
            className="flex-1 py-3 rounded-xl bg-green-600 text-white font-semibold active:bg-green-700 disabled:opacity-40"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Per-hole edit sheet */}
      {editing && currentEditingPlayer && currentEditingHole && (
        <HoleEditSheet
          playerName={currentEditingPlayer.display_name}
          hole={currentEditingHole}
          strokes={currentEditingState?.strokes ?? null}
          putts={currentEditingState?.putts ?? null}
          onChange={(patch) => updateScore(editing.playerId, editing.holeNumber, patch)}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Confirm save */}
      <ConfirmModal
        open={confirmOpen}
        title="Save changes?"
        message="Your changes update the saved scorecard. Affected handicap differentials and indexes are recalculated. The round will be marked as edited."
        confirmLabel={saving ? "Saving..." : "Save changes"}
        cancelLabel="Keep editing"
        onConfirm={async () => {
          setConfirmOpen(false);
          await handleSave();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

// ── HoleGrid ───────────────────────────────────────────────────────────

function HoleGrid({
  visibleHoles,
  scores,
  onTap,
}: {
  visibleHoles: EditorHole[];
  scores: Record<number, { strokes: number | null; putts: number | null }>;
  onTap: (holeNumber: number) => void;
}) {
  const front = visibleHoles.filter((h) => h.hole_number <= 9);
  const back = visibleHoles.filter((h) => h.hole_number > 9);

  function renderRow(rowHoles: EditorHole[], label: string) {
    if (rowHoles.length === 0) return null;
    const totalStrokes = rowHoles.reduce((s, h) => s + (scores[h.hole_number]?.strokes ?? 0), 0);
    return (
      <div className="mb-3">
        <p className="text-[0.625rem] text-gray-400 uppercase tracking-wide mb-1">{label}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400">
                <td className="pr-2 py-1 font-medium">Hole</td>
                {rowHoles.map((h) => (
                  <td key={h.hole_number} className="text-center w-9 py-1 font-medium">{h.hole_number}</td>
                ))}
                <td className="text-center w-10 py-1 font-bold border-l border-gray-200">
                  {label === "Front 9" || label === "Holes" ? "Out" : "In"}
                </td>
              </tr>
              <tr className="text-gray-400 border-b border-gray-100">
                <td className="pr-2 py-1">Par</td>
                {rowHoles.map((h) => (
                  <td key={h.hole_number} className="text-center py-1">{h.par}</td>
                ))}
                <td className="text-center py-1 border-l border-gray-200">
                  {rowHoles.reduce((s, h) => s + h.par, 0)}
                </td>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="pr-2 py-1.5 text-gray-500">Score</td>
                {rowHoles.map((h) => {
                  const s = scores[h.hole_number];
                  return (
                    <td key={h.hole_number} className="text-center py-1.5">
                      <button
                        type="button"
                        onClick={() => onTap(h.hole_number)}
                        className="w-9 h-9 rounded-md border border-amber-300 bg-amber-50 text-sm font-bold tabular-nums text-gray-900 active:bg-amber-100"
                      >
                        {s?.strokes ?? "·"}
                      </button>
                    </td>
                  );
                })}
                <td className="text-center py-1.5 font-bold text-gray-900 border-l border-gray-200 tabular-nums">
                  {totalStrokes || "–"}
                </td>
              </tr>
              <tr>
                <td className="pr-2 py-1 text-gray-400">Putts</td>
                {rowHoles.map((h) => {
                  const s = scores[h.hole_number];
                  return (
                    <td key={h.hole_number} className="text-center py-1 text-gray-500 text-[0.6875rem]">
                      {s?.putts ?? "·"}
                    </td>
                  );
                })}
                <td className="text-center py-1 text-gray-500 border-l border-gray-200 tabular-nums text-[0.6875rem]">
                  {rowHoles.reduce((s, h) => s + (scores[h.hole_number]?.putts ?? 0), 0) || "–"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div>
      {renderRow(front, front.length === visibleHoles.length ? "Holes" : "Front 9")}
      {renderRow(back, "Back 9")}
    </div>
  );
}

// ── HoleEditSheet ──────────────────────────────────────────────────────

function HoleEditSheet({
  playerName,
  hole,
  strokes,
  putts,
  onChange,
  onClose,
}: {
  playerName: string;
  hole: EditorHole;
  strokes: number | null;
  putts: number | null;
  onChange: (patch: { strokes?: number | null; putts?: number | null }) => void;
  onClose: () => void;
}) {
  // Lock background scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const initialStrokes = strokes ?? hole.par;
  const currentStrokes = strokes ?? initialStrokes;
  const currentPutts = putts ?? 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl animate-slide-up">
        <div className="px-6 pt-3 pb-3 border-b border-gray-100">
          <DragHandle onClose={onClose} className="mb-2" />
          <p className="text-xs text-gray-500">{playerName}</p>
          <h2 className="text-xl font-bold text-gray-900">
            Hole {hole.hole_number} <span className="text-gray-400 text-base font-normal">· Par {hole.par}</span>
          </h2>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Strokes */}
          <Stepper
            label="Strokes"
            value={currentStrokes}
            min={1}
            max={15}
            onChange={(v) => onChange({ strokes: v })}
          />

          {/* Putts */}
          <Stepper
            label="Putts"
            value={currentPutts}
            min={0}
            max={10}
            onChange={(v) => onChange({ putts: v === 0 && putts == null ? null : v })}
            allowClear
            onClear={() => onChange({ putts: null })}
          />
        </div>

        <div className="px-6 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-green-600 text-white font-semibold active:bg-green-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  allowClear,
  onClear,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  allowClear?: boolean;
  onClear?: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        {allowClear && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="text-[0.6875rem] text-gray-500 underline active:text-gray-700"
          >
            Clear
          </button>
        )}
      </div>
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="w-12 h-12 rounded-full bg-gray-100 text-gray-700 text-xl font-bold active:bg-gray-200 disabled:opacity-30"
        >
          −
        </button>
        <span className="text-3xl font-bold text-gray-900 tabular-nums w-12 text-center">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="w-12 h-12 rounded-full bg-green-600 text-white text-xl font-bold active:bg-green-700 disabled:opacity-30"
        >
          +
        </button>
      </div>
    </div>
  );
}
