"use client";

import { useState, useRef, useCallback, useEffect, Fragment } from "react";
import ScoringShell, { type HoleInfo } from "@/components/scoring/ScoringShell";
import { getScoreDescription } from "@/lib/golf/calculator";
import { DragHandle } from "@/components/DragHandle";
import { subscribeToRound } from "@/lib/realtime/round-channel";
import { RoundComments } from "@/components/rounds/RoundComments";
import { ScoreMark } from "@/components/scoring/ScoreMark";

// Scramble scoring for a personal round: the whole group plays ONE team ball,
// so there is a single score per hole. We persist that team score by fanning it
// out to every round_players row (each member's card equals the team card),
// which lets the round reuse the entire individual-round pipeline — the
// /scores endpoint, realtime sync, and the completion flow — unchanged. The
// interaction language mirrors the admin scramble scorer (ScoringManager): one
// number per hole, debounced flush. Scramble rounds never touch handicaps
// (enforced server-side; see rounds.format).

interface TeamMember {
  // For Loozers this is their user_id; for guests a temp token before the
  // round exists. Used only for display — scoring is team-level.
  id: string;
  name: string;
  isGuest?: boolean;
  teeId?: string;
}

interface ScrambleScoringEntryProps {
  holes: HoleInfo[];
  members: TeamMember[];
  roundType: string;
  courseName: string;
  onClose: () => void;
  // For new rounds: create the round on mount.
  courseId?: string;
  teeId?: string;
  teeColor?: string | null;
  roundDate?: string;
  // For resuming an existing scramble round.
  roundId?: string;
  initialTeamScores?: Record<number, number>;
  initialRoundPlayerIds?: string[];
  contestBadges?: Record<number, string[]>; // hole_number -> daily-contest labels
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

function scoreColorClass(strokes: number | undefined, par: number): string {
  if (strokes === undefined) return "text-gray-300";
  if (strokes < par) return "text-green-700";
  if (strokes > par) return "text-red-600";
  return "text-gray-900";
}

export default function ScrambleScoringEntry({
  holes: allHoles,
  members: initialMembers,
  roundType,
  courseName,
  onClose,
  courseId,
  teeId,
  teeColor,
  roundDate,
  roundId: existingRoundId,
  initialTeamScores,
  initialRoundPlayerIds,
  contestBadges,
}: ScrambleScoringEntryProps) {
  const visibleHoles = allHoles.filter((h) => {
    if (roundType === "9-front") return h.hole_number <= 9;
    if (roundType === "9-back") return h.hole_number > 9;
    return true;
  });

  // Team scores: hole_number -> strokes (a single value for the whole group).
  const [scores, setScores] = useState<Record<number, number>>(initialTeamScores || {});
  const [members, setMembers] = useState<TeamMember[]>(initialMembers);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [roundId, setRoundId] = useState<string | null>(existingRoundId || null);
  // Every round_players row we fan the team score out to on save.
  const [roundPlayerIds, setRoundPlayerIds] = useState<string[]>(initialRoundPlayerIds || []);
  const roundPlayerIdsRef = useRef(roundPlayerIds);
  useEffect(() => {
    roundPlayerIdsRef.current = roundPlayerIds;
  }, [roundPlayerIds]);

  const [ready, setReady] = useState(!!existingRoundId);
  // Current viewer (simulator-aware) for the comments thread's delete gate.
  const [me, setMe] = useState<{ id: string; isAdmin: boolean } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.user?.id) setMe({ id: d.user.id, isAdmin: !!d.user.is_admin });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const [confirmCompleteOpen, setConfirmCompleteOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<"live" | "connecting" | "offline">("connecting");

  // Dirty tracking: hole_number -> strokes.
  const dirtyRef = useRef<Map<number, number>>(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Create round on mount if new (guard against StrictMode double-mount).
  const creatingRef = useRef(false);
  useEffect(() => {
    if (existingRoundId || !courseId || !teeId || creatingRef.current) return;
    creatingRef.current = true;

    async function createRound() {
      const res = await fetch("/api/rounds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course_id: courseId,
          tee_id: teeId,
          round_type: roundType,
          format: "scramble",
          round_date: roundDate || new Date().toISOString().split("T")[0],
          players: initialMembers.map((m) => ({
            key: m.id,
            user_id: m.isGuest ? null : m.id,
            guest_name: m.isGuest ? m.name : null,
            tee_id: m.teeId || teeId,
          })),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setRoundId(data.round.id);
        const rps = (data.round_players || []) as {
          id: string;
          user_id: string | null;
          guest_name: string | null;
          player_position: number;
        }[];
        const sorted = [...rps].sort((a, b) => (a.player_position || 0) - (b.player_position || 0));
        setRoundPlayerIds(sorted.map((rp) => rp.id));
        setReady(true);
      }
    }
    createRound();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flush saves — fan the team's dirty holes out to every roster row.
  const flushSaves = useCallback(async () => {
    const toSave = Array.from(dirtyRef.current.entries());
    const rpIds = roundPlayerIdsRef.current;
    if (toSave.length === 0 || !roundId || rpIds.length === 0) return;

    dirtyRef.current.clear();
    setSaveStatus("saving");

    try {
      const scoreList = toSave.map(([hole_number, strokes]) => ({ hole_number, strokes }));
      const playerScores = rpIds.map((rpId) => ({ round_player_id: rpId, scores: scoreList }));

      const res = await fetch(`/api/rounds/${roundId}/scores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player_scores: playerScores }),
      });

      if (res.ok) {
        setSaveStatus("saved");
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
      } else {
        setSaveStatus("error");
        for (const [hole, strokes] of toSave) dirtyRef.current.set(hole, strokes);
      }
    } catch {
      setSaveStatus("error");
      for (const [hole, strokes] of toSave) dirtyRef.current.set(hole, strokes);
    }
  }, [roundId]);

  const scheduleSave = useCallback(() => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    // 900ms so rapid +/- taps (e.g. tapping up to a triple bogey) coalesce
    // into a single save instead of firing — and racing — on every tap.
    flushTimerRef.current = setTimeout(flushSaves, 900);
  }, [flushSaves]);

  // Flush on unmount.
  useEffect(() => {
    const dirty = dirtyRef;
    const rid = roundId;
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      const toSave = Array.from(dirty.current.entries());
      const rpIds = roundPlayerIdsRef.current;
      if (toSave.length > 0 && rid && rpIds.length > 0) {
        const scoreList = toSave.map(([hole_number, strokes]) => ({ hole_number, strokes }));
        fetch(`/api/rounds/${rid}/scores`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            player_scores: rpIds.map((rpId) => ({ round_player_id: rpId, scores: scoreList })),
          }),
        });
      }
    };
  }, [roundId]);

  // ── Realtime sync ──────────────────────────────────────────────────────
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const roundIdRef = useRef(roundId);
  useEffect(() => {
    roundIdRef.current = roundId;
  }, [roundId]);

  // Rebuild the roster (round_player_ids + member names) after a remote
  // add/remove so the fan-out targets stay correct.
  const reloadRoster = useCallback(async () => {
    const rid = roundIdRef.current;
    if (!rid) return;
    const res = await fetch(`/api/rounds/${rid}`);
    if (!res.ok) return;
    const json = await res.json();
    const rps = (json.round?.round_players || []) as {
      id: string;
      user_id: string | null;
      guest_name?: string | null;
      user: { display_name?: string } | { display_name?: string }[] | null;
      player_position?: number;
    }[];
    const sorted = [...rps].sort((a, b) => (a.player_position || 0) - (b.player_position || 0));
    setRoundPlayerIds(sorted.map((rp) => rp.id));
    setMembers(
      sorted.map((rp) => {
        const user = Array.isArray(rp.user) ? rp.user[0] : rp.user;
        return {
          id: rp.user_id ?? `guest:${rp.id}`,
          name: user?.display_name || rp.guest_name || "Player",
          isGuest: !rp.user_id,
        };
      }),
    );
  }, []);

  useEffect(() => {
    if (!roundId) return;
    const unsubscribe = subscribeToRound(roundId, {
      onScoreChange: ({ kind, row, old }) => {
        const ref = row ?? old;
        if (!ref) return;
        // Actively editing this hole? Our debounce will win — ignore the echo.
        if (dirtyRef.current.has(ref.hole_number)) return;

        if (kind === "DELETE") {
          setScores((prev) => {
            const next = { ...prev };
            delete next[ref.hole_number];
            return next;
          });
          return;
        }
        // INSERT / UPDATE — every roster row carries the same team score, so
        // any one row's value is authoritative.
        if (row) {
          setScores((prev) => ({ ...prev, [row.hole_number]: row.strokes }));
        }
      },
      onRosterChange: ({ kind }) => {
        // UPDATE fires constantly (gross stamps) — only structural changes
        // matter for the fan-out target list.
        if (kind !== "INSERT" && kind !== "DELETE") return;
        reloadRoster();
      },
      onRoundChange: ({ row }) => {
        if (row?.status === "completed") onCloseRef.current();
      },
      onStatusChange: (status) => {
        if (status === "SUBSCRIBED") setLiveStatus("live");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setLiveStatus("offline");
        else if (status === "CLOSED") setLiveStatus("connecting");
      },
    });
    return unsubscribe;
  }, [roundId, reloadRoster]);

  function setTeamScore(holeNumber: number, value: number) {
    setScores((prev) => ({ ...prev, [holeNumber]: value }));
    dirtyRef.current.set(holeNumber, value);
    scheduleSave();
  }

  function increment(par: number, holeNumber: number) {
    const current = scores[holeNumber];
    if (current === undefined) setTeamScore(holeNumber, par);
    else setTeamScore(holeNumber, Math.min(current + 1, 15));
  }

  function decrement(par: number, holeNumber: number) {
    const current = scores[holeNumber];
    if (current === undefined) setTeamScore(holeNumber, Math.max(1, par - 1));
    else if (current > 1) setTeamScore(holeNumber, current - 1);
  }

  async function handleComplete() {
    if (completing) return;
    setCompleting(true);
    setCompleteError(null);
    try {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      await flushSaves();

      if (!roundId) return;

      const res = await fetch(`/api/rounds/${roundId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setCompleteError(data?.error || `Failed to complete round (${res.status})`);
        return;
      }

      onClose();
    } catch {
      setCompleteError("Network error — please try again");
    } finally {
      setCompleting(false);
    }
  }

  const holesPlayed = visibleHoles.filter((h) => scores[h.hole_number] != null).length;
  const teamTotal = visibleHoles.reduce((sum, h) => sum + (scores[h.hole_number] ?? 0), 0);
  const allComplete = visibleHoles.every((h) => scores[h.hole_number] != null);
  const memberLabel =
    members.length === 0
      ? "Team"
      : members.map((m) => m.name).join(" · ");

  if (!ready) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Setting up scramble...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <ScoringShell
        holes={visibleHoles}
        onClose={onClose}
        teeColor={teeColor}
        saveStatus={saveStatus}
        contestBadges={contestBadges}
        startingHole={(() => {
          if (typeof window === "undefined" || !roundId) return undefined;
          try {
            const raw = sessionStorage.getItem(`ls_hole_${roundId}`);
            const n = raw ? parseInt(raw, 10) : NaN;
            return Number.isFinite(n) ? n : undefined;
          } catch {
            return undefined;
          }
        })()}
        onHoleChange={(_idx, hole) => {
          if (typeof window !== "undefined" && roundId) {
            try {
              sessionStorage.setItem(`ls_hole_${roundId}`, String(hole.hole_number));
            } catch {
              /* ignore */
            }
          }
        }}
        headerRight={
          <div className="flex items-center gap-2 text-xs">
            <span
              className={
                liveStatus === "live"
                  ? "inline-flex items-center gap-1 text-green-600"
                  : liveStatus === "offline"
                    ? "inline-flex items-center gap-1 text-red-500"
                    : "inline-flex items-center gap-1 text-gray-400"
              }
              title={
                liveStatus === "live"
                  ? "Live — changes from other devices appear automatically"
                  : liveStatus === "offline"
                    ? "Disconnected — local edits will sync when reconnected"
                    : "Connecting…"
              }
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  liveStatus === "live"
                    ? "bg-green-500"
                    : liveStatus === "offline"
                      ? "bg-red-500"
                      : "bg-gray-400 animate-pulse"
                }`}
              />
              {liveStatus === "live" ? "Live" : liveStatus === "offline" ? "Offline" : "Connecting"}
            </span>
            <span className="text-gray-500">
              {holesPlayed}/{visibleHoles.length}
            </span>
          </div>
        }
        scorecardLeadHeader="#"
        renderScorecardRows={(holes, currentHoleNumber) => {
          const hasBothNines = holes.length > 9 && holes[0]?.hole_number <= 9;
          const front9 = hasBothNines ? holes.filter((h) => h.hole_number <= 9) : [];
          const back9 = hasBothNines ? holes.filter((h) => h.hole_number > 9) : [];
          const front9Total = front9.reduce((s, h) => s + (scores[h.hole_number] ?? 0), 0);
          const back9Total = back9.reduce((s, h) => s + (scores[h.hole_number] ?? 0), 0);
          const total = holes.reduce((s, h) => s + (scores[h.hole_number] ?? 0), 0);
          const hasAny = holes.some((h) => scores[h.hole_number] != null);
          const hasAnyFront = front9.some((h) => scores[h.hole_number] != null);
          const hasAnyBack = back9.some((h) => scores[h.hole_number] != null);
          void currentHoleNumber;
          return (
            <>
              <tr className="border-t border-gray-100">
                <td className="px-1 py-0.5 text-center text-gray-400 font-bold border-r border-gray-200">Par</td>
                {holes.map((h) => (
                  <Fragment key={h.hole_number}>
                    {h.hole_number === 10 && hasBothNines && (
                      <td className="px-0 py-0.5 text-center text-gray-400 font-bold border-l border-r border-gray-200">
                        {front9.reduce((s, fh) => s + fh.par, 0)}
                      </td>
                    )}
                    <td className="px-0 py-0.5 text-center text-gray-400">{h.par}</td>
                  </Fragment>
                ))}
                {hasBothNines && (
                  <td className="px-0 py-0.5 text-center text-gray-400 font-bold border-l border-r border-gray-200">
                    {back9.reduce((s, h) => s + h.par, 0)}
                  </td>
                )}
                <td className="px-0 py-0.5 text-center text-gray-400 font-bold border-l border-gray-200">
                  {holes.reduce((s, h) => s + h.par, 0)}
                </td>
              </tr>
              <tr className="border-t border-gray-100">
                <td className="px-1 py-0.5 text-center text-gray-300 font-bold border-r border-gray-200">Hcp</td>
                {holes.map((h) => (
                  <Fragment key={h.hole_number}>
                    {h.hole_number === 10 && hasBothNines && (
                      <td className="px-0 py-0.5 text-center text-gray-300 border-l border-r border-gray-200" />
                    )}
                    <td className="px-0 py-0.5 text-center text-gray-300">{h.handicap_index}</td>
                  </Fragment>
                ))}
                {hasBothNines && (
                  <td className="px-0 py-0.5 text-center text-gray-300 border-l border-r border-gray-200" />
                )}
                <td className="px-0 py-0.5 text-center text-gray-300 border-l border-gray-200" />
              </tr>
              <tr className="border-t border-gray-100">
                <td className="px-1 py-0.5 text-center border-r border-gray-200">
                  <span
                    className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[0.625rem] font-bold leading-none bg-green-600 text-white"
                    title={memberLabel}
                  >
                    T
                  </span>
                </td>
                {holes.map((h) => (
                  <Fragment key={h.hole_number}>
                    {h.hole_number === 10 && hasBothNines && (
                      <td className="px-0 py-0.5 text-center font-bold text-gray-900 border-l border-r border-gray-200">
                        {hasAnyFront ? front9Total : "·"}
                      </td>
                    )}
                    <td className="px-0 py-0.5 text-center">
                      <ScoreMark score={scores[h.hole_number]} par={h.par} />
                    </td>
                  </Fragment>
                ))}
                {hasBothNines && (
                  <td className="px-0 py-0.5 text-center font-bold text-gray-900 border-l border-r border-gray-200">
                    {hasAnyBack ? back9Total : "·"}
                  </td>
                )}
                <td className="px-0 py-0.5 text-center font-bold text-gray-900 border-l border-gray-200">
                  {hasAny ? total : "·"}
                </td>
              </tr>
            </>
          );
        }}
        courseStrip={
          <div className="shrink-0 bg-gray-900 px-4 py-1.5 flex items-center justify-center">
            <span className="text-xs font-medium text-white truncate">{courseName}</span>
          </div>
        }
        renderScorePanel={(hole) => {
          const current = scores[hole.hole_number];
          const hasValue = current !== undefined;
          const description = hasValue ? getScoreDescription(current, hole.par) : null;
          return (
            <div className="px-3 pt-2 pb-1">
              <div className="flex items-center bg-gray-50 rounded-lg px-3 py-3">
                {/* Team label + members */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-800">Team</div>
                  <div className="text-[0.625rem] text-gray-400 truncate">{memberLabel}</div>
                  {description && (
                    <div className="text-[0.6875rem] font-medium text-gray-500 mt-0.5">{description}</div>
                  )}
                </div>
                {/* Running total */}
                <div className="w-[44px] shrink-0 flex flex-col items-center leading-none mr-1">
                  <span className="text-2xl font-bold tabular-nums text-gray-900">
                    {holesPlayed > 0 ? teamTotal : ""}
                  </span>
                  {holesPlayed > 0 && <span className="text-[0.4375rem] text-gray-400 uppercase">Total</span>}
                </div>
                {/* Strokes stepper */}
                <div className="flex items-center gap-[8px] shrink-0">
                  <button
                    onClick={() => decrement(hole.par, hole.hole_number)}
                    disabled={hasValue && current <= 1}
                    className="w-[40px] h-[40px] flex items-center justify-center rounded-full bg-green-600 text-white text-xl font-bold disabled:opacity-30 active:bg-green-700"
                  >
                    −
                  </button>
                  <div className="w-[40px] flex flex-col items-center leading-none">
                    <span className={`text-3xl font-bold tabular-nums ${scoreColorClass(current, hole.par)}`}>
                      {hasValue ? current : "·"}
                    </span>
                    <span className="text-[0.4375rem] text-gray-400 uppercase -mt-0.5">Strokes</span>
                  </div>
                  <button
                    onClick={() => increment(hole.par, hole.hole_number)}
                    className="w-[40px] h-[40px] flex items-center justify-center rounded-full bg-green-600 text-white text-xl font-bold active:bg-green-700"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Reserved slot: always rendered so the panel doesn't jump when
                  the final score flips allComplete=true. */}
              <button
                type="button"
                onClick={() => setConfirmCompleteOpen(true)}
                disabled={!allComplete}
                aria-hidden={!allComplete}
                tabIndex={allComplete ? 0 : -1}
                className={`w-full mt-2 py-3 font-semibold rounded-xl transition-opacity ${
                  allComplete
                    ? "bg-green-600 text-white active:bg-green-700 opacity-100"
                    : "bg-green-600 text-white opacity-0 pointer-events-none"
                }`}
              >
                Complete Scramble
              </button>

              {/* Live comments (issue #140) — visible while scoring. */}
              {roundId && me && (
                <div className="mt-3 rounded-xl border border-gray-100 bg-white p-3">
                  <h2 className="text-xs font-bold text-gray-900 mb-1">Comments</h2>
                  <RoundComments roundId={roundId} currentUserId={me.id} isAdmin={me.isAdmin} />
                </div>
              )}
            </div>
          );
        }}
      />
      {confirmCompleteOpen && (
        <div className="fixed top-14 left-0 right-0 z-[55] flex items-end justify-center bottom-[calc(4rem+env(safe-area-inset-bottom))]">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !completing && setConfirmCompleteOpen(false)}
          />
          <div className="relative w-full max-w-lg bg-white rounded-t-3xl animate-slide-up">
            <div className="px-6 pt-5 pb-3 border-b border-gray-100">
              <DragHandle onClose={() => !completing && setConfirmCompleteOpen(false)} className="mb-4" />
              <h2 className="text-xl font-bold text-gray-900">Complete scramble?</h2>
            </div>
            <div className="px-6 py-4 text-sm text-gray-600">
              <p>
                This scramble is saved to everyone&apos;s history but{" "}
                <strong>does not count toward anyone&apos;s handicap</strong>. You can reopen it from the round
                detail page if you need to fix a hole.
              </p>
              {completeError && <p className="mt-3 text-sm text-red-600">{completeError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
              <button
                onClick={async () => {
                  await handleComplete();
                }}
                disabled={completing}
                className="flex-1 py-3 rounded-xl font-semibold text-[0.9375rem] bg-green-600 text-white active:opacity-80 disabled:opacity-60"
              >
                {completing ? "Completing..." : "Complete scramble"}
              </button>
              <button
                onClick={() => setConfirmCompleteOpen(false)}
                disabled={completing}
                className="flex-1 py-3 border border-gray-300 rounded-xl font-semibold text-[0.9375rem] text-gray-600 active:bg-gray-50 disabled:opacity-60"
              >
                Keep editing
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
