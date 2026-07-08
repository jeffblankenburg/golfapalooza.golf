"use client";

import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type ScoreRow = {
  id: string;
  round_id: string;
  round_player_id: string;
  hole_number: number;
  strokes: number;
  putts: number | null;
};

export type RoundPlayerRow = {
  id: string;
  round_id: string;
  user_id: string;
  tee_id: string | null;
  player_position: number;
};

export type RoundRow = {
  id: string;
  status: string;
};

export type RoundCommentRow = {
  id: string;
  round_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

type ChangeKind = "INSERT" | "UPDATE" | "DELETE";

export interface RoundChannelHandlers {
  onScoreChange?: (event: { kind: ChangeKind; row: ScoreRow | null; old: ScoreRow | null }) => void;
  onRosterChange?: (event: { kind: ChangeKind; row: RoundPlayerRow | null; old: RoundPlayerRow | null }) => void;
  onRoundChange?: (event: { kind: ChangeKind; row: RoundRow | null; old: RoundRow | null }) => void;
  onComment?: (event: { kind: ChangeKind; row: RoundCommentRow | null; old: RoundCommentRow | null }) => void;
  onStatusChange?: (status: "SUBSCRIBED" | "CHANNEL_ERROR" | "CLOSED" | "TIMED_OUT") => void;
}

/**
 * Issue #132. Subscribe to all writes on a round (scores, roster, status).
 * One channel per round. Returns a cleanup that tears down the subscription.
 *
 * Last-write-wins is enforced upstream — this helper just forwards events.
 * Callers should ignore echoes of their own pending dirty edits (the
 * `LiveScoringEntry` merge does this via its `dirtyRef`).
 */
export function subscribeToRound(
  roundId: string,
  handlers: RoundChannelHandlers,
): () => void {
  const supabase = createClient();
  const channel: RealtimeChannel = supabase.channel(`round:${roundId}`);

  if (handlers.onScoreChange) {
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "round_scores", filter: `round_id=eq.${roundId}` },
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
      { event: "*", schema: "public", table: "round_players", filter: `round_id=eq.${roundId}` },
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
      { event: "*", schema: "public", table: "rounds", filter: `id=eq.${roundId}` },
      (payload) => {
        handlers.onRoundChange!({
          kind: payload.eventType as ChangeKind,
          row: (payload.new as RoundRow) ?? null,
          old: (payload.old as RoundRow) ?? null,
        });
      },
    );
  }

  if (handlers.onComment) {
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "round_comments", filter: `round_id=eq.${roundId}` },
      (payload) => {
        handlers.onComment!({
          kind: payload.eventType as ChangeKind,
          row: (payload.new as RoundCommentRow) ?? null,
          old: (payload.old as RoundCommentRow) ?? null,
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
