"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ScorecardView from "@/components/my-rounds/ScorecardView";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { AddPlayerDrawer } from "@/components/my-rounds/AddPlayerDrawer";
import { BTN_BACK, BTN_DESTRUCTIVE } from "@/lib/ui/buttons";

interface RoundData {
  id: string;
  created_by: string;
  created_at: string;
  round_date: string;
  round_type: string;
  status: string;
  notes: string | null;
  edited_at: string | null;
  edited_by: string | null;
  course: { name: string; city: string | null; state: string | null } | null;
  tee: { tee_name: string; tee_color: string | null; course_rating: number; slope_rating: number; par: number } | null;
  round_players: {
    id: string;
    user_id: string;
    final_gross_score: number | null;
    score_differential: number | null;
    user: { id: string; display_name: string; full_name: string | null } | null;
    player_tee: { tee_name: string; tee_color: string | null; course_rating: number; slope_rating: number; par: number } | null;
    scores: { hole_number: number; strokes: number; putts: number | null }[];
  }[];
}

interface HoleData {
  hole_number: number;
  par: number;
  handicap_index: number;
  yards: number | null;
}

const TEE_DOT_COLORS: Record<string, string> = {
  Black: "bg-gray-900",
  Blue: "bg-blue-600",
  White: "bg-white border border-gray-400",
  Gold: "bg-yellow-500",
  Green: "bg-green-600",
  Red: "bg-red-600",
  Silver: "bg-gray-400",
};

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export default function RoundDetailPage() {
  const params = useParams();
  const router = useRouter();
  const roundId = params.id as string;

  const [data, setData] = useState<{ round: RoundData | null; holes: HoleData[]; currentUserId: string | null; isAdmin: boolean } | null>(null);
  const [expandedPlayers, setExpandedPlayers] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [addPlayerOpen, setAddPlayerOpen] = useState(false);
  const [removePlayer, setRemovePlayer] = useState<{ id: string; name: string } | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    async function fetchData() {
      const res = await fetch(`/api/rounds/${roundId}`);
      const json = await res.json();
      setData({
        round: json.round,
        holes: json.holes || [],
        currentUserId: json.current_user_id || null,
        isAdmin: !!json.is_admin,
      });

      // Default-expand the current user's card
      if (json.current_user_id && json.round?.round_players) {
        const myPlayer = json.round.round_players.find(
          (p: { user_id: string }) => p.user_id === json.current_user_id
        );
        if (myPlayer) {
          setExpandedPlayers(new Set([myPlayer.id]));
        }
      }
    }
    fetchData();
  }, [roundId, refreshKey]);

  const round = data?.round ?? null;
  const holes = data?.holes ?? [];
  const currentUserId = data?.currentUserId;
  const isAdmin = data?.isAdmin ?? false;

  function togglePlayer(playerId: string) {
    setExpandedPlayers((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  }

  async function handleDelete() {
    setDeleting(true);
    setConfirmDeleteOpen(false);
    await fetch(`/api/rounds/${roundId}`, { method: "DELETE" });
    router.push("/my-rounds");
    router.refresh();
  }

  async function handleRemovePlayer(playerId: string) {
    setRemoving(true);
    const res = await fetch(`/api/rounds/${roundId}/players/${playerId}`, { method: "DELETE" });
    setRemoving(false);
    setRemovePlayer(null);
    if (!res.ok) return;
    const json = await res.json().catch(() => null);
    const removedSelf = json?.removed_user_id && json.removed_user_id === data?.currentUserId;
    if (json?.round_deleted || removedSelf) {
      router.push("/my-rounds");
      router.refresh();
      return;
    }
    setRefreshKey((k) => k + 1);
  }

  if (!data) {
    return (
      <div className="px-4 py-6 max-w-lg mx-auto">
        <div className="text-center py-12 text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!round) {
    return (
      <div className="px-4 py-6 max-w-lg mx-auto">
        <div className="text-center py-12 text-gray-500">Round not found</div>
      </div>
    );
  }

  const course = Array.isArray(round.course) ? round.course[0] : round.course;
  const roundTee = Array.isArray(round.tee) ? round.tee[0] : round.tee;
  const players = round.round_players || [];
  const currentPlayer = players.find((p) => p.user_id === currentUserId);
  const currentPlayerTee = currentPlayer?.player_tee
    ? (Array.isArray(currentPlayer.player_tee) ? currentPlayer.player_tee[0] : currentPlayer.player_tee)
    : null;
  const tee = currentPlayerTee || roundTee;
  // For 9-hole rounds, par is the sum of the played holes' pars — not the
  // tee's full 18-hole par. Fall back to halving the tee par if hole data
  // is missing.
  const playedHoles = holes.filter((h) => {
    if (round.round_type === "9-front") return h.hole_number <= 9;
    if (round.round_type === "9-back") return h.hole_number > 9;
    return true;
  });
  const par = playedHoles.length > 0
    ? playedHoles.reduce((sum, h) => sum + h.par, 0)
    : round.round_type === "18"
      ? tee?.par || 72
      : Math.round((tee?.par || 72) / 2);

  // Resolve creator name from players list
  const creatorPlayer = players.find((p) => p.user_id === round.created_by);
  const creatorUser = creatorPlayer?.user;
  const creatorName = Array.isArray(creatorUser) ? creatorUser[0]?.display_name : creatorUser?.display_name;
  // Co-equal ownership (issue #130): any player in the round (or an admin)
  // can edit, delete, and manage the roster.
  const iAmPlayerInRound = !!players.find((p) => p.user_id === currentUserId);
  const canManage = iAmPlayerInRound || isAdmin;
  const canEdit = canManage && round.status === "completed";

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <Link href="/my-rounds" className={BTN_BACK}>← My Rounds</Link>

      <div className="mt-3 mb-6">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4">
          <div className="flex items-start gap-3">
            <div className={`w-8 h-8 rounded-full shrink-0 mt-0.5 ${TEE_DOT_COLORS[tee?.tee_color || ""] || "bg-gray-300"}`} />
            <div className="flex-1 min-w-0">
              <h1 className="font-semibold text-gray-900 leading-snug">{course?.name || "Unknown Course"}</h1>
              {(course?.city || course?.state) && (
                <div className="text-sm text-gray-500">{[course?.city, course?.state].filter(Boolean).join(", ")}</div>
              )}
              <div className="text-sm text-gray-600 mt-1">
                {formatDate(round.round_date)}
                {round.round_type !== "18" && (
                  <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                    {round.round_type === "9-front" ? "Front 9" : "Back 9"}
                  </span>
                )}
                {round.edited_at && (
                  <span className="ml-1.5 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded" title={`Last edited ${new Date(round.edited_at).toLocaleString()}`}>
                    Edited
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <span className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-lg font-medium">
                  {tee?.tee_name || "—"} tees
                </span>
                <span className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-lg font-medium">
                  Par {par}
                </span>
                <span className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-lg font-medium">
                  Rating {tee?.course_rating}
                </span>
                <span className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-lg font-medium">
                  Slope {tee?.slope_rating}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Player cards — effective user first */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs uppercase tracking-wide text-gray-500 font-medium">Players</h2>
        {canManage && (
          <button
            type="button"
            onClick={() => setAddPlayerOpen(true)}
            className="text-xs font-semibold text-green-700 active:opacity-70"
          >
            + Add player
          </button>
        )}
      </div>
      <div className="space-y-2 mb-6">
        {[...players].sort((a, b) => {
          if (a.user_id === currentUserId) return -1;
          if (b.user_id === currentUserId) return 1;
          return 0;
        }).map((player) => {
          const userName = Array.isArray(player.user) ? player.user[0]?.display_name : player.user?.display_name;
          const isMe = player.user_id === currentUserId;
          const grossScore = player.final_gross_score;
          const scoreToPar = grossScore != null ? grossScore - par : null;
          const isExpanded = expandedPlayers.has(player.id);
          const playerScores = player.scores || [];
          const hasScores = playerScores.length > 0;

          // Build scores and putts maps for ScorecardView
          const scoresMap: Record<number, number> = {};
          const puttsMap: Record<number, number> = {};
          let hasPutts = false;
          for (const s of playerScores) {
            scoresMap[s.hole_number] = s.strokes;
            if (s.putts != null) {
              puttsMap[s.hole_number] = s.putts;
              hasPutts = true;
            }
          }

          return (
            <div key={player.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden relative">
              {canManage && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRemovePlayer({ id: player.id, name: userName || "Player" });
                  }}
                  aria-label={`Remove ${userName || "player"} from round`}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-gray-400 active:bg-gray-100 active:text-gray-700 z-10"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
              <button
                onClick={() => hasScores && togglePlayer(player.id)}
                className={`w-full text-left p-4 ${hasScores ? "cursor-pointer" : "cursor-default"}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-gray-900">
                          {userName || "Player"}
                        </span>
                        {isMe && (
                          <span className="text-[10px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded-full font-medium">You</span>
                        )}
                      </div>
                      {(player.score_differential != null || playerScores.some((s) => s.putts != null)) && (
                        <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                          {player.score_differential != null && (
                            <span>Diff: {player.score_differential.toFixed(1)}</span>
                          )}
                          {playerScores.some((s) => s.putts != null) && (
                            <span>Putts: {playerScores.reduce((sum, s) => sum + (s.putts ?? 0), 0)}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {grossScore != null && (
                      <div className="text-right">
                        <span className="text-2xl font-bold text-gray-900">{grossScore}</span>
                        {scoreToPar != null && (
                          <span className={`ml-1.5 text-sm font-medium ${
                            scoreToPar > 0 ? "text-red-600" : scoreToPar < 0 ? "text-green-600" : "text-gray-500"
                          }`}>
                            {scoreToPar > 0 ? "+" : ""}{scoreToPar}
                          </span>
                        )}
                      </div>
                    )}
                    {hasScores && (
                      <svg
                        className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                  </div>
                </div>
              </button>

              {isExpanded && hasScores && (
                <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                  <ScorecardView holes={holes} scores={scoresMap} putts={hasPutts ? puttsMap : undefined} roundType={round.round_type} />
                  <div className="mt-3 pt-2 border-t border-gray-100 text-[11px] text-gray-400 italic">
                    Attested by {creatorName || "unknown"} on{" "}
                    {new Date(round.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {round.status === "in_progress" && (
        <Link
          href={`/my-rounds/rounds/${roundId}/live`}
          className="block w-full text-center py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors mb-4"
        >
          Resume Scoring
        </Link>
      )}

      {round.notes && (
        <div className="bg-gray-50 rounded-lg p-3 mb-6">
          <div className="text-xs text-gray-500 mb-1">Notes</div>
          <div className="text-sm text-gray-700">{round.notes}</div>
        </div>
      )}

      {canEdit && (
        <Link
          href={`/my-rounds/rounds/${roundId}/edit`}
          className="block w-full text-center py-3 mb-2 rounded-lg border border-gray-300 text-gray-700 font-semibold active:bg-gray-50"
        >
          Edit Round
        </Link>
      )}

      {canManage && (
        <button
          onClick={() => setConfirmDeleteOpen(true)}
          disabled={deleting}
          className={`w-full disabled:opacity-50 ${BTN_DESTRUCTIVE}`}
        >
          {deleting ? "Deleting..." : "Delete Round"}
        </button>
      )}

      <ConfirmModal
        open={confirmDeleteOpen}
        title="Delete this round?"
        message={
          <span>
            This removes scores for <strong>everyone in the group</strong> and can&apos;t be undone.
          </span>
        }
        confirmLabel={deleting ? "Deleting..." : "Delete round"}
        cancelLabel="Keep round"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteOpen(false)}
      />

      <ConfirmModal
        open={!!removePlayer}
        title={
          players.length <= 1
            ? "Remove the last player?"
            : `Remove ${removePlayer?.name || "player"}?`
        }
        message={
          players.length <= 1 ? (
            <span>
              This is the last player. Removing them <strong>deletes the round</strong>.
            </span>
          ) : (
            <span>
              {removePlayer?.name || "Their"}&apos;s scores will be deleted from this round. The other players stay.
            </span>
          )
        }
        confirmLabel={removing ? "Removing..." : players.length <= 1 ? "Delete round" : "Remove player"}
        cancelLabel="Cancel"
        destructive
        onConfirm={() => removePlayer && handleRemovePlayer(removePlayer.id)}
        onCancel={() => !removing && setRemovePlayer(null)}
      />

      <AddPlayerDrawer
        open={addPlayerOpen}
        roundId={roundId}
        excludedUserIds={players.map((p) => p.user_id)}
        onClose={() => setAddPlayerOpen(false)}
        onAdded={() => {
          setAddPlayerOpen(false);
          setRefreshKey((k) => k + 1);
        }}
      />
    </div>
  );
}
