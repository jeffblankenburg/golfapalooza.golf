"use client";

import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

// v2 mirror of src/lib/realtime/round-channel.ts (issue #132), on the v2_*
// tables. One channel per round routes score / roster / status changes to the
// scorer. Last-write-wins is enforced by the caller (dirty-aware merge).

export type ScoreRow = {
  id: string;
  round_id: string;
  round_player_id: string;
  hole_number: number;
  strokes: number | null;
  putts: number | null;
  fairway_hit: boolean | null;
  green_in_regulation: boolean | null;
  penalty_strokes: number | null;
};

export type RoundPlayerRow = {
  id: string;
  round_id: string;
  user_id: string | null;
  tee_id: string | null;
  player_position: number | null;
};

export type RoundRow = {
  id: string;
  status: string;
};

type ChangeKind = "INSERT" | "UPDATE" | "DELETE";

export interface RoundChannelHandlers {
  onScoreChange?: (event: { kind: ChangeKind; row: ScoreRow | null; old: ScoreRow | null }) => void;
  onRosterChange?: (event: { kind: ChangeKind; row: RoundPlayerRow | null; old: RoundPlayerRow | null }) => void;
  onRoundChange?: (event: { kind: ChangeKind; row: RoundRow | null; old: RoundRow | null }) => void;
  onStatusChange?: (status: "SUBSCRIBED" | "CHANNEL_ERROR" | "CLOSED" | "TIMED_OUT") => void;
}

/**
 * Subscribe to all writes on a v2 round. Returns a cleanup that tears down the
 * subscription.
 */
export function subscribeToV2Round(
  roundId: string,
  handlers: RoundChannelHandlers,
): () => void {
  const supabase = createClient();
  const channel: RealtimeChannel = supabase.channel(`v2-round:${roundId}`);

  if (handlers.onScoreChange) {
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "v2_round_scores", filter: `round_id=eq.${roundId}` },
      (payload) => {
        handlers.onScoreChange!({
          kind: payload.eventType as ChangeKind,
          row: (payload.new as ScoreRow) ?? null,
          old: (payload.old as ScoreRow) ?? null,
        });
      },
    );
  }

  if (handlers.onRosterChange) {
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "v2_round_players", filter: `round_id=eq.${roundId}` },
      (payload) => {
        handlers.onRosterChange!({
          kind: payload.eventType as ChangeKind,
          row: (payload.new as RoundPlayerRow) ?? null,
          old: (payload.old as RoundPlayerRow) ?? null,
        });
      },
    );
  }

  if (handlers.onRoundChange) {
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "v2_rounds", filter: `id=eq.${roundId}` },
      (payload) => {
        handlers.onRoundChange!({
          kind: payload.eventType as ChangeKind,
          row: (payload.new as RoundRow) ?? null,
          old: (payload.old as RoundRow) ?? null,
        });
      },
    );
  }

  channel.subscribe((status) => {
    handlers.onStatusChange?.(status as Parameters<NonNullable<RoundChannelHandlers["onStatusChange"]>>[0]);
  });

  return () => {
    supabase.removeChannel(channel);
  };
}
