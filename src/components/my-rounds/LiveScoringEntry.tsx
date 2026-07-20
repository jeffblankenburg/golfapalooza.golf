"use client";

import { useState, useRef, useCallback, useEffect, useMemo, Fragment } from "react";
import ScoringShell, { type HoleInfo } from "@/components/scoring/ScoringShell";
import { strokesByHoleIndex } from "@/lib/golf/stroke-distribution";
import { getScoreDescription } from "@/lib/golf/calculator";
import { DragHandle } from "@/components/DragHandle";
import { subscribeToRound } from "@/lib/realtime/round-channel";
import { TEE_HEX_COLORS } from "@/lib/utils/tee-colors";
import { RoundComments } from "@/components/rounds/RoundComments";
import { ScoreMark } from "@/components/scoring/ScoreMark";

interface Player {
  // Stable per-player key for local state. For Loozers this is their user_id;
  // for guests it's a temp token before the round exists, then `guest:<rpId>`.
  id: string;
  name: string;
  isGuest?: boolean;
  teeName?: string;
  teeColor?: string | null;
  teeId?: string;
  roundPlayerId?: string; // set after round is created
}

// Compute swatch styles for the leading scorecard cell: filled colored badge.
// White tee gets a thin border so the badge doesn't disappear against the cell.
// Composition tees ("Black/Blue") get the gradient only as a fallback when no
// per-hole color is available — callers should pass the current hole's
// `source_tee_color` so the badge reflects which tee the player is actually
// playing on this hole.
function teeBadgeStyle(teeColor?: string | null): { background: string; color: string; border?: string } {
  if (!teeColor) return { background: "#e5e7eb", color: "#374151" };
  if (teeColor.includes("/")) {
    const parts = teeColor.split("/").map((c) => c.trim());
    const hexes = parts.map((c) => TEE_HEX_COLORS[c] || "#9ca3af");
    return {
      background: `linear-gradient(135deg, ${hexes[0]} 50%, ${hexes[1] || hexes[0]} 50%)`,
      color: "#ffffff",
      border: hexes.includes("#f3f4f6") ? "1px solid #9ca3af" : undefined,
    };
  }
  const hex = TEE_HEX_COLORS[teeColor] || "#9ca3af";
  if (hex === "#f3f4f6") return { background: hex, color: "#374151", border: "1px solid #9ca3af" };
  return { background: hex, color: "#ffffff" };
}

// Per-hole tee color for a player: if their assignment is a composition
// ("Black/Blue"), use the current hole's resolved `source_tee_color`. Otherwise
// the player's assignment is already a single color.
function effectiveTeeColor(playerTeeColor: string | null | undefined, currentHole: HoleInfo | undefined): string | null | undefined {
  if (!playerTeeColor?.includes("/")) return playerTeeColor;
  return currentHole?.source_tee_color || playerTeeColor;
}

interface LiveScoringEntryProps {
  holes: HoleInfo[];
  players: Player[];
  roundType: string;
  courseName: string;
  onClose: () => void;
  // For new rounds: create round on mount
  courseId?: string;
  teeId?: string;
  effectiveTeeId?: string; // current user's tee (may differ for composition tees)
  teeColor?: string | null; // tee color for map markers
  roundDate?: string;
  // For resuming: existing round data
  roundId?: string;
  initialScores?: Record<string, Record<number, number>>;
  initialPutts?: Record<string, Record<number, number>>;
  initialPlayerMap?: Record<string, string>; // userId -> roundPlayerId
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

function scoreColorClass(strokes: number | undefined, par: number): string {
  if (strokes === undefined) return "text-gray-300";
  if (strokes < par) return "text-green-700";
  if (strokes > par) return "text-red-600";
  return "text-gray-900";
}

export default function LiveScoringEntry({
  holes: allHoles,
  players: initialPlayers,
  roundType,
  courseName,
  onClose,
  courseId,
  teeId,
  effectiveTeeId,
  teeColor,
  roundDate,
  roundId: existingRoundId,
  initialScores,
  initialPutts,
  initialPlayerMap,
}: LiveScoringEntryProps) {
  // If the effective tee differs (composition tee), fetch resolved holes on mount
  const [resolvedHoles, setResolvedHoles] = useState<HoleInfo[] | null>(null);

  useEffect(() => {
    if (!effectiveTeeId || effectiveTeeId === teeId || !courseId) return;
    // Check if the passed holes already have source_tee_color (already resolved)
    const hasSourceColors = allHoles.some((h) => h.source_tee_color);
    if (hasSourceColors) return;

    async function fetchCompositionHoles() {
      const res = await fetch(`/api/courses/${courseId}/tees/${effectiveTeeId}/holes`);
      if (res.ok) {
        const data = await res.json();
        setResolvedHoles(data.holes || []);
      }
    }
    fetchCompositionHoles();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveTeeId, teeId, courseId]);

  const effectiveHoles = resolvedHoles || allHoles;

  const visibleHoles = effectiveHoles.filter((h) => {
    if (roundType === "9-front") return h.hole_number <= 9;
    if (roundType === "9-back") return h.hole_number > 9;
    return true;
  });

  const [scores, setScores] = useState<Record<string, Record<number, number>>>(initialScores || {});
  const [putts, setPutts] = useState<Record<string, Record<number, number>>>(initialPutts || {});
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [roundId, setRoundId] = useState<string | null>(existingRoundId || null);
  const [playerMap, setPlayerMap] = useState<Record<string, string>>(initialPlayerMap || {});
  // Roster is local state (not the prop) so realtime INSERT/DELETE events can
  // merge new/removed players in place without reloading the whole page.
  const [players, setPlayers] = useState<Player[]>(initialPlayers);

  // Course Handicap per player key (user_id), fetched once the round exists.
  // Drives the "pops" dots — handicap strokes each player gets relative to the
  // group's lowest, allocated to the hardest holes. Loozers only; guests and
  // players without an established index are absent → no pops.
  const [courseHcp, setCourseHcp] = useState<Record<string, number>>({});

  // Suppress the global pull-to-refresh while live scoring is mounted. The
  // listener in PullToRefresh.tsx fires on any touch ancestor that lacks the
  // opt-out — HeaderBar above us is sticky z-[60] (not .fixed.z-50), so
  // incidental thumb contact at the top of the screen was reloading the page
  // mid-round. Body-level opt-out catches every touch path.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prev = document.body.getAttribute("data-pull-refresh");
    document.body.setAttribute("data-pull-refresh", "off");
    return () => {
      if (prev == null) document.body.removeAttribute("data-pull-refresh");
      else document.body.setAttribute("data-pull-refresh", prev);
    };
  }, []);

  const [ready, setReady] = useState(!!existingRoundId);
  // Current viewer (simulator-aware) so the comments thread knows whose
  // comments can be deleted. Best-effort — comments still render if this fails.
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

  // Dirty tracking
  const dirtyRef = useRef<Map<string, { round_player_id: string; hole_number: number; strokes: number; putts?: number }>>(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentHoleRef = useRef<HoleInfo>(visibleHoles[0]);

  // Create round on mount if new (guard against StrictMode double-mount)
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
          round_date: roundDate || new Date().toISOString().split("T")[0],
          players: initialPlayers.map((p) => ({
            key: p.id,
            user_id: p.isGuest ? null : p.id,
            guest_name: p.isGuest ? p.name : null,
            tee_id: p.teeId || teeId,
          })),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setRoundId(data.round.id);
        // Re-key local state to the canonical player key (user_id for Loozers,
        // `guest:<rpId>` for guests). Safe because no scores exist yet at
        // creation — this matches the scheme reloadRoster uses on later syncs.
        const rps = (data.round_players || []) as {
          id: string;
          user_id: string | null;
          player_position: number;
        }[];
        const map: Record<string, string> = {};
        const rebuilt: Player[] = [];
        for (const rp of [...rps].sort((a, b) => (a.player_position || 0) - (b.player_position || 0))) {
          const local = initialPlayers[(rp.player_position ?? 0) - 1];
          const key = rp.user_id ?? `guest:${rp.id}`;
          map[key] = rp.id;
          rebuilt.push({ ...(local ?? { id: key, name: "Player" }), id: key, roundPlayerId: rp.id });
        }
        setPlayers(rebuilt);
        setPlayerMap(map);
        setReady(true);
      }
    }
    createRound();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flush saves
  const flushSaves = useCallback(async () => {
    const toSave = Array.from(dirtyRef.current.values());
    if (toSave.length === 0 || !roundId) return;

    dirtyRef.current.clear();
    setSaveStatus("saving");

    try {
      // Group by round_player_id for batch upsert
      const playerScoresMap = new Map<string, { hole_number: number; strokes: number; putts?: number }[]>();
      for (const s of toSave) {
        const existing = playerScoresMap.get(s.round_player_id) || [];
        existing.push({ hole_number: s.hole_number, strokes: s.strokes, ...(s.putts !== undefined ? { putts: s.putts } : {}) });
        playerScoresMap.set(s.round_player_id, existing);
      }

      const playerScores = Array.from(playerScoresMap.entries()).map(([rpId, scores]) => ({
        round_player_id: rpId,
        scores,
      }));

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
        for (const s of toSave) {
          dirtyRef.current.set(`${s.round_player_id}-${s.hole_number}`, s);
        }
      }
    } catch {
      setSaveStatus("error");
      for (const s of toSave) {
        dirtyRef.current.set(`${s.round_player_id}-${s.hole_number}`, s);
      }
    }
  }, [roundId]);

  const scheduleSave = useCallback(() => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(flushSaves, 600);
  }, [flushSaves]);

  // Flush on unmount
  useEffect(() => {
    const dirty = dirtyRef;
    const rid = roundId;
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      const toSave = Array.from(dirty.current.values());
      if (toSave.length > 0 && rid) {
        const playerScoresMap = new Map<string, { hole_number: number; strokes: number }[]>();
        for (const s of toSave) {
          const existing = playerScoresMap.get(s.round_player_id) || [];
          existing.push({ hole_number: s.hole_number, strokes: s.strokes });
          playerScoresMap.set(s.round_player_id, existing);
        }
        fetch(`/api/rounds/${rid}/scores`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            player_scores: Array.from(playerScoresMap.entries()).map(([rpId, scores]) => ({
              round_player_id: rpId,
              scores,
            })),
          }),
        });
      }
    };
  }, [roundId]);

  // ── Realtime sync (issue #132) ─────────────────────────────────────────
  // Subscribe to live changes on this round so two devices in the same
  // group stay in lockstep. Last-write-wins: a hole that's currently dirty
  // locally is NOT overwritten by remote echoes — our flush will win.

  // Reverse lookup: round_player_id → userId, so we can map incoming
  // score events back into the locally-keyed-by-userId state.
  const playerMapRef = useRef(playerMap);
  useEffect(() => {
    playerMapRef.current = playerMap;
  }, [playerMap]);

  // Stabilize callbacks for the realtime effect so it only re-subscribes when
  // the roundId itself changes — otherwise every parent re-render churns the
  // channel (parent passes a fresh `onClose` arrow each time).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const roundIdRef = useRef(roundId);
  useEffect(() => {
    roundIdRef.current = roundId;
  }, [roundId]);

  // Pull each player's Course Handicap for the pops display. Refetched on
  // roster changes so the group's lowest (and thus everyone's strokes) stays
  // correct when someone joins or leaves.
  const refreshHandicaps = useCallback(async () => {
    const rid = roundIdRef.current;
    if (!rid) return;
    try {
      const res = await fetch(`/api/rounds/${rid}/handicaps`);
      if (!res.ok) return;
      const data = await res.json();
      const map: Record<string, number> = {};
      for (const h of (data.handicaps || []) as {
        user_id: string;
        course_handicap: number;
      }[]) {
        if (h.user_id != null && h.course_handicap != null) {
          map[h.user_id] = h.course_handicap;
        }
      }
      setCourseHcp(map);
    } catch {
      /* best-effort — pops are a non-essential display aid */
    }
  }, []);

  useEffect(() => {
    if (roundId) refreshHandicaps();
  }, [roundId, refreshHandicaps]);

  // Rebuild local roster from the server after a remote add/remove. Preserves
  // existing per-player scores/putts (server state could be 1-2 saves behind
  // our local edits) and adds empty maps for any newly arriving players.
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
      player_tee: { tee_name?: string } | { tee_name?: string }[] | null;
      tee_id?: string;
    }[];

    // Canonical key: user_id for Loozers, `guest:<rpId>` for guests.
    const keyOf = (rp: { id: string; user_id: string | null }) =>
      rp.user_id ?? `guest:${rp.id}`;

    const nextPlayers: Player[] = rps.map((rp) => {
      const user = Array.isArray(rp.user) ? rp.user[0] : rp.user;
      const tee = Array.isArray(rp.player_tee) ? rp.player_tee[0] : rp.player_tee;
      return {
        id: keyOf(rp),
        name: user?.display_name || rp.guest_name || "Player",
        isGuest: !rp.user_id,
        teeName: tee?.tee_name,
        teeId: rp.tee_id,
        roundPlayerId: rp.id,
      };
    });
    const nextMap: Record<string, string> = {};
    for (const rp of rps) nextMap[keyOf(rp)] = rp.id;
    const validKeys = new Set(rps.map(keyOf));

    setPlayers(nextPlayers);
    setPlayerMap(nextMap);
    setScores((prev) => {
      const next: typeof prev = {};
      for (const k of Object.keys(prev)) {
        if (validKeys.has(k)) next[k] = prev[k];
      }
      for (const k of validKeys) {
        if (!next[k]) next[k] = {};
      }
      return next;
    });
    setPutts((prev) => {
      const next: typeof prev = {};
      for (const k of Object.keys(prev)) {
        if (validKeys.has(k)) next[k] = prev[k];
      }
      for (const k of validKeys) {
        if (!next[k]) next[k] = {};
      }
      return next;
    });
    // Roster changed → the group's low handicap may have too. Refresh pops.
    refreshHandicaps();
  }, [refreshHandicaps]);

  useEffect(() => {
    if (!roundId) return;
    const unsubscribe = subscribeToRound(roundId, {
      onScoreChange: ({ kind, row, old }) => {
        const ref = row ?? old;
        if (!ref) return;
        // If this hole is currently dirty locally, the user is actively
        // editing it. Our debounce will flush and win — ignore the remote
        // value (it's probably an echo of an older write anyway).
        const dirtyKey = `${ref.round_player_id}-${ref.hole_number}`;
        if (dirtyRef.current.has(dirtyKey)) return;

        // Find the userId for this round_player_id.
        const map = playerMapRef.current;
        const userId = Object.keys(map).find((uid) => map[uid] === ref.round_player_id);
        if (!userId) return;

        if (kind === "DELETE") {
          setScores((prev) => {
            const next = { ...prev };
            if (next[userId]) {
              const nextPlayer = { ...next[userId] };
              delete nextPlayer[ref.hole_number];
              next[userId] = nextPlayer;
            }
            return next;
          });
          setPutts((prev) => {
            const next = { ...prev };
            if (next[userId]) {
              const nextPlayer = { ...next[userId] };
              delete nextPlayer[ref.hole_number];
              next[userId] = nextPlayer;
            }
            return next;
          });
          return;
        }

        // INSERT / UPDATE: merge.
        if (row) {
          setScores((prev) => ({
            ...prev,
            [userId]: { ...(prev[userId] || {}), [row.hole_number]: row.strokes },
          }));
          if (row.putts != null) {
            setPutts((prev) => ({
              ...prev,
              [userId]: { ...(prev[userId] || {}), [row.hole_number]: row.putts! },
            }));
          }
        }
      },
      onRosterChange: ({ kind }) => {
        // UPDATE on round_players fires constantly during scoring (the scores
        // endpoint stamps `final_gross_score` after every save), so ignore.
        // INSERT/DELETE → someone joined or left the round; merge into local
        // state without a full reload (which would jump back to hole 1 and
        // wipe any in-flight edits not yet flushed).
        if (kind !== "INSERT" && kind !== "DELETE") return;
        reloadRoster();
      },
      onRoundChange: ({ row }) => {
        // Status flip → bail out of the live scorer. The parent page's
        // onClose navigates to /my-rounds.
        if (row?.status === "completed") {
          onCloseRef.current();
        }
      },
      onStatusChange: (status) => {
        if (status === "SUBSCRIBED") setLiveStatus("live");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setLiveStatus("offline");
        else if (status === "CLOSED") setLiveStatus("connecting");
      },
    });
    return unsubscribe;
    // onClose accessed via onCloseRef so it isn't a dep; reloadRoster is
    // stable (empty-deps useCallback). Re-subscribing only on roundId
    // prevents the channel from churning on every parent re-render.
  }, [roundId, reloadRoster]);

  function setScore(playerId: string, holeNumber: number, value: number) {
    setScores((prev) => ({
      ...prev,
      [playerId]: { ...(prev[playerId] || {}), [holeNumber]: value },
    }));

    const rpId = playerMap[playerId];
    if (rpId) {
      const key = `${rpId}-${holeNumber}`;
      const existing = dirtyRef.current.get(key);
      dirtyRef.current.set(key, {
        round_player_id: rpId,
        hole_number: holeNumber,
        strokes: value,
        putts: existing?.putts,
      });
      scheduleSave();
    }
  }

  function setPuttCount(playerId: string, holeNumber: number, value: number) {
    setPutts((prev) => ({
      ...prev,
      [playerId]: { ...(prev[playerId] || {}), [holeNumber]: value },
    }));

    const rpId = playerMap[playerId];
    if (rpId) {
      const key = `${rpId}-${holeNumber}`;
      const existing = dirtyRef.current.get(key);
      const strokes = scores[playerId]?.[holeNumber];
      if (strokes !== undefined) {
        dirtyRef.current.set(key, {
          round_player_id: rpId,
          hole_number: holeNumber,
          strokes,
          putts: value,
        });
        scheduleSave();
      }
    }
  }

  function increment(playerId: string, par: number, holeNumber: number) {
    const current = scores[playerId]?.[holeNumber];
    if (current === undefined) {
      setScore(playerId, holeNumber, par);
    } else {
      setScore(playerId, holeNumber, Math.min(current + 1, 15));
    }
  }

  function decrement(playerId: string, par: number, holeNumber: number) {
    const current = scores[playerId]?.[holeNumber];
    if (current === undefined) {
      setScore(playerId, holeNumber, Math.max(1, par - 1));
    } else if (current > 1) {
      setScore(playerId, holeNumber, current - 1);
    }
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

  const allComplete = players.every(
    (p) => visibleHoles.every((h) => scores[p.id]?.[h.hole_number] != null)
  );

  // Group-adjusted handicap strokes per player key (user_id): each player's
  // Course Handicap minus the group's lowest. Needs at least two known
  // handicaps for the notion of "pops relative to the group" to mean anything.
  const adjustedStrokes = useMemo(() => {
    const known = players
      .filter((p) => !p.isGuest && courseHcp[p.id] != null)
      .map((p) => courseHcp[p.id]);
    if (known.length < 2) return {} as Record<string, number>;
    const low = Math.min(...known);
    const out: Record<string, number> = {};
    for (const p of players) {
      if (!p.isGuest && courseHcp[p.id] != null) {
        out[p.id] = Math.max(0, Math.round(courseHcp[p.id] - low));
      }
    }
    return out;
  }, [players, courseHcp]);

  if (!ready) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Setting up round...</p>
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
      // Restore the hole the user was on if iOS reloaded the page. Stored
      // per-round so concurrent rounds don't clobber each other.
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
        currentHoleRef.current = hole;
        if (typeof window !== "undefined" && roundId) {
          try {
            sessionStorage.setItem(`ls_hole_${roundId}`, String(hole.hole_number));
          } catch { /* ignore */ }
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
            {players.reduce((max, p) => {
              const count = visibleHoles.filter((h) => scores[p.id]?.[h.hole_number] != null).length;
              return Math.max(max, count);
            }, 0)}/{visibleHoles.length}
          </span>
        </div>
      }
      scorecardLeadHeader="#"
      scorecardTrailHeader="Putt"
      renderScorecardRows={(holes, currentHoleNumber) => {
        const hasBothNines = holes.length > 9 && holes[0]?.hole_number <= 9;
        const front9 = hasBothNines ? holes.filter((h) => h.hole_number <= 9) : [];
        const back9 = hasBothNines ? holes.filter((h) => h.hole_number > 9) : [];
        const currentHole = holes.find((h) => h.hole_number === currentHoleNumber);
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
              <td className="px-0 py-0.5 border-l border-gray-200" />
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
              <td className="px-0 py-0.5 border-l border-gray-200" />
            </tr>
            {players.map((p) => {
              const total = holes.reduce((s, h) => s + (scores[p.id]?.[h.hole_number] ?? 0), 0);
              const front9Total = front9.reduce((s, h) => s + (scores[p.id]?.[h.hole_number] ?? 0), 0);
              const back9Total = back9.reduce((s, h) => s + (scores[p.id]?.[h.hole_number] ?? 0), 0);
              const hasAny = holes.some((h) => scores[p.id]?.[h.hole_number] != null);
              const hasAnyFront = front9.some((h) => scores[p.id]?.[h.hole_number] != null);
              const hasAnyBack = back9.some((h) => scores[p.id]?.[h.hole_number] != null);
              const initial = (p.name?.trim()?.[0] || "?").toUpperCase();
              const badge = teeBadgeStyle(effectiveTeeColor(p.teeColor, currentHole));
              return (
                <tr key={p.id} className="border-t border-gray-100">
                  <td className="px-1 py-0.5 text-center border-r border-gray-200">
                    <span
                      className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[0.625rem] font-bold leading-none"
                      style={badge}
                      title={p.teeName || undefined}
                    >
                      {initial}
                    </span>
                  </td>
                  {holes.map((h) => (
                    <Fragment key={h.hole_number}>
                      {h.hole_number === 10 && hasBothNines && (
                        <td className="px-0 py-0.5 text-center font-bold text-gray-900 border-l border-r border-gray-200">
                          {hasAnyFront ? front9Total : "·"}
                        </td>
                      )}
                      <td className="px-0 py-0.5">
                        {(() => {
                          const pops = adjustedStrokes[p.id]
                            ? strokesByHoleIndex(adjustedStrokes[p.id], h.handicap_index)
                            : 0;
                          // Fixed-height slots — a dot strip (always present, even
                          // with 0 pops) over a 16px mark slot — so both the dot
                          // row and the marks line up across every cell and the
                          // double-bogey box never crowds the dots.
                          return (
                            <div className="flex flex-col items-center leading-none">
                              <div className="flex items-center justify-center gap-[1.5px] h-[4px] mb-[1px]">
                                {Array.from({ length: Math.min(pops, 3) }).map((_, i) => (
                                  <span key={i} className="w-[3px] h-[3px] rounded-full bg-gray-500" />
                                ))}
                              </div>
                              <div className="h-4 flex items-center justify-center">
                                <ScoreMark score={scores[p.id]?.[h.hole_number]} par={h.par} />
                              </div>
                              {/* Balances the 5px dot strip above so the mark
                                  centers in the cell and lines up with the
                                  player's initial badge. */}
                              <div className="h-[5px]" />
                            </div>
                          );
                        })()}
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
                  <td className="px-0 py-0.5 text-center font-semibold text-gray-500 border-l border-gray-200">
                    {(() => {
                      const anyPutts = holes.some((h) => putts[p.id]?.[h.hole_number] != null);
                      const puttTotal = holes.reduce((s, h) => s + (putts[p.id]?.[h.hole_number] ?? 0), 0);
                      return anyPutts ? puttTotal : "·";
                    })()}
                  </td>
                </tr>
              );
            })}
          </>
        );
      }}
      courseStrip={
        <div className="shrink-0 bg-gray-900 px-4 py-1.5 flex items-center justify-center">
          <span className="text-xs font-medium text-white truncate">{courseName}</span>
        </div>
      }
      renderScorePanel={(hole) => (
        <div className="px-3 pt-2 pb-1">
          <div className="space-y-1.5">
            {players.map((p) => {
              const current = scores[p.id]?.[hole.hole_number];
              const hasValue = current !== undefined;
              const description = hasValue ? getScoreDescription(current, hole.par) : null;

              const currentPutts = putts[p.id]?.[hole.hole_number];

              const roundTotal = visibleHoles.reduce((sum, h) => sum + (scores[p.id]?.[h.hole_number] ?? 0), 0);
              const holesPlayed = visibleHoles.filter((h) => scores[p.id]?.[h.hole_number] != null).length;
              // Score relative to the par of holes played so far, e.g. (+5).
              const parPlayed = visibleHoles.reduce(
                (sum, h) => sum + (scores[p.id]?.[h.hole_number] != null ? h.par : 0),
                0,
              );
              const toPar = roundTotal - parPlayed;
              const toParLabel = toPar === 0 ? "E" : toPar > 0 ? `+${toPar}` : `${toPar}`;

              return (
                <div key={p.id} className="flex items-center bg-gray-50 rounded-lg px-3 py-1.5">
                  {/* Player info — pixel-fixed widths/gaps below keep the
                      stepper controls on-screen at xlarge font scale;
                      rem-based widths grew enough to push putts off the
                      right edge. */}
                  <div className="w-[56px] min-w-0 shrink-0">
                    <div className="text-xs font-semibold text-gray-700 truncate">{p.name}</div>
                    {p.teeName && <div className="text-[0.625rem] text-gray-400 truncate">{p.teeName}</div>}
                  </div>
                  {/* Running total with the par differential as a superscript.
                      An invisible label matching the Strokes column's keeps the
                      two big numbers vertically aligned without the extra text. */}
                  <div className="min-w-[40px] shrink-0 flex flex-col items-center leading-none">
                    {holesPlayed > 0 ? (
                      <>
                        <span className="text-2xl font-bold tabular-nums text-gray-900">
                          {roundTotal}
                          <sup className="ml-[1px] text-[0.8125rem] font-semibold tabular-nums text-gray-500">
                            {toParLabel}
                          </sup>
                        </span>
                        <span aria-hidden className="text-[0.4375rem] uppercase -mt-0.5 invisible">Total</span>
                      </>
                    ) : null}
                  </div>
                  <div className="flex-1" />
                  {/* Strokes */}
                  <div className="flex items-center gap-[6px] shrink-0">
                    <button
                      onClick={() => decrement(p.id, hole.par, hole.hole_number)}
                      disabled={hasValue && current <= 1}
                      className="w-[36px] h-[36px] flex items-center justify-center rounded-full bg-green-600 text-white text-lg font-bold disabled:opacity-30 active:bg-green-700"
                    >
                      −
                    </button>
                    <div className="w-[36px] flex flex-col items-center leading-none">
                      <span className={`text-2xl font-bold tabular-nums ${scoreColorClass(current, hole.par)}`}>
                        {hasValue ? current : "·"}
                      </span>
                      <span className="text-[0.4375rem] text-gray-400 uppercase -mt-0.5">Strokes</span>
                    </div>
                    <button
                      onClick={() => increment(p.id, hole.par, hole.hole_number)}
                      className="w-[36px] h-[36px] flex items-center justify-center rounded-full bg-green-600 text-white text-lg font-bold active:bg-green-700"
                    >
                      +
                    </button>
                  </div>
                  {/* Putts */}
                  <div className="w-px h-7 bg-gray-200 shrink-0 mx-[8px]" />
                  <div className="flex items-center gap-[4px] shrink-0">
                    <button
                      onClick={() => setPuttCount(p.id, hole.hole_number, currentPutts === undefined ? 0 : Math.max(0, currentPutts - 1))}
                      disabled={currentPutts !== undefined && currentPutts <= 0}
                      className="w-[28px] h-[28px] flex items-center justify-center rounded-full bg-gray-200 text-gray-600 text-xs font-bold disabled:opacity-30 active:bg-gray-300"
                    >
                      −
                    </button>
                    <div className="w-[20px] flex flex-col items-center leading-none">
                      <span className="text-base font-bold tabular-nums text-gray-700">
                        {currentPutts ?? "·"}
                      </span>
                      <span className="text-[0.4375rem] text-gray-400 uppercase -mt-0.5">Putts</span>
                    </div>
                    <button
                      onClick={() => setPuttCount(p.id, hole.hole_number, currentPutts === undefined ? 1 : Math.min(10, currentPutts + 1))}
                      className="w-[28px] h-[28px] flex items-center justify-center rounded-full bg-gray-200 text-gray-600 text-xs font-bold active:bg-gray-300"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Only rendered once every player is complete — no reserved slot, so
              the panel sizes to the actual roster (a real 5th player still shows
              via the players map above). */}
          {allComplete && (
            <button
              type="button"
              onClick={() => setConfirmCompleteOpen(true)}
              className="w-full mt-2 py-3 font-semibold rounded-xl bg-green-600 text-white active:bg-green-700"
            >
              Complete Round
            </button>
          )}

          {/* Live comments (issue #140) — visible while scoring so the group
              sees remarks as they happen. Mounts once the round exists. */}
          {roundId && me && (
            <div className="mt-3 rounded-xl border border-gray-100 bg-white p-3">
              <h2 className="text-xs font-bold text-gray-900 mb-1">Comments</h2>
              <RoundComments roundId={roundId} currentUserId={me.id} isAdmin={me.isAdmin} />
            </div>
          )}
        </div>
      )}
    />
    {confirmCompleteOpen && (
      // z-[55] sits above ScoringShell (z-50) and below HeaderBar/BottomNav (z-60).
      // The shared ConfirmModal is z-35, which renders behind the full-screen shell.
      <div className="fixed top-14 left-0 right-0 z-[55] flex items-end justify-center bottom-[calc(4rem+env(safe-area-inset-bottom))]">
        <div
          className="absolute inset-0 bg-black/50"
          onClick={() => !completing && setConfirmCompleteOpen(false)}
        />
        <div className="relative w-full max-w-lg bg-white rounded-t-3xl animate-slide-up">
          <div className="px-6 pt-5 pb-3 border-b border-gray-100">
            <DragHandle
              onClose={() => !completing && setConfirmCompleteOpen(false)}
              className="mb-4"
            />
            <h2 className="text-xl font-bold text-gray-900">Complete round?</h2>
          </div>
          <div className="px-6 py-4 text-sm text-gray-600">
            <p>
              Once you complete this round, it&apos;s saved to your history and counted toward your handicap. You can reopen it from the round detail page if you need to fix something.
            </p>
            {completeError && (
              <p className="mt-3 text-sm text-red-600">{completeError}</p>
            )}
          </div>
          <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
            <button
              onClick={async () => {
                await handleComplete();
              }}
              disabled={completing}
              className="flex-1 py-3 rounded-xl font-semibold text-[0.9375rem] bg-green-600 text-white active:opacity-80 disabled:opacity-60"
            >
              {completing ? "Completing..." : "Complete round"}
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
