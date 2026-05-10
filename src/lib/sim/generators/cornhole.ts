/**
 * Issue #128 — Cornhole bracket generator.
 *
 * Builds single-elim brackets for both `cornhole_singles` and
 * `cornhole_doubles` contests, then walks every match in round order
 * picking random winners and propagating them through the
 * `next_winner_match_id` linkages.
 *
 * For sim purposes we ignore `contests.bracket_format` (which controls
 * double-elim variants) and always use single-elim — the goal is to
 * produce a fully-played bracket so the leaderboard / champion display
 * can be verified, not to exercise every bracket variant. Admins can
 * use the existing admin tools to test other formats.
 *
 * Idempotent — wipes existing matches + cornhole_teams + scores first.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { listTestEventContests, randInt, shuffle, chunk } from "../shared";
import type { GeneratorResult } from "../types";
import {
  generateSingleElimination,
  type BracketMatch,
} from "@/lib/bracket/generate";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, "public", any>;

async function buildAndPlayBracket(
  client: Client,
  contestId: string,
  participantIds: string[],
): Promise<{ inserted: number; warnings: string[] }> {
  const warnings: string[] = [];
  if (participantIds.length < 2) {
    return { inserted: 0, warnings: ["Need at least 2 participants for a bracket."] };
  }

  // Wipe existing matches for this contest.
  await client.from("cornhole_bracket_matches").delete().eq("contest_id", contestId);

  // Generate the bracket (single-elim) using the same helper the admin
  // route uses, so the structure / linkage logic stays consistent.
  const seeded = shuffle([...participantIds]);
  const matches: BracketMatch[] = generateSingleElimination(seeded.length, seeded);

  // Two-pass insert: rows first, then update linkages once UUIDs exist.
  const insertRows = matches.map((m) => ({
    contest_id: contestId,
    bracket_type: m.bracket_type,
    round_number: m.round_number,
    match_number: m.match_number,
    slot1_participant_id: m.slot1_participant_id,
    slot2_participant_id: m.slot2_participant_id,
    seed1: m.seed1,
    seed2: m.seed2,
    is_bye: m.is_bye,
  }));

  const { error: insertErr } = await client
    .from("cornhole_bracket_matches")
    .insert(insertRows);
  if (insertErr) {
    return { inserted: 0, warnings: [`bracket insert: ${insertErr.message}`] };
  }

  // Re-fetch to build index → UUID map.
  const { data: inserted } = await client
    .from("cornhole_bracket_matches")
    .select("id, bracket_type, round_number, match_number")
    .eq("contest_id", contestId);

  const keyToId: Record<string, string> = {};
  for (const row of inserted || []) {
    keyToId[`${row.bracket_type}|${row.round_number}|${row.match_number}`] = row.id as string;
  }
  const idMap = matches.map(
    (m) => keyToId[`${m.bracket_type}|${m.round_number}|${m.match_number}`],
  );

  // Wire linkages.
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const updateFields: Record<string, unknown> = {};
    if (m.next_winner_match_index !== null) {
      updateFields.next_winner_match_id = idMap[m.next_winner_match_index];
      updateFields.next_winner_slot = m.next_winner_slot;
    }
    if (m.next_loser_match_index !== null) {
      updateFields.next_loser_match_id = idMap[m.next_loser_match_index];
      updateFields.next_loser_slot = m.next_loser_slot;
    }
    if (Object.keys(updateFields).length > 0) {
      await client
        .from("cornhole_bracket_matches")
        .update(updateFields)
        .eq("id", idMap[i]);
    }
  }

  // Walk the bracket in round order, picking random winners + advancing
  // them into next_winner_match_id's slot. Each "match" gets a 21-X score
  // with X randomized [10, 19] for sim flavor.
  const playedSet = new Set<string>();
  const orderedMatches = [...(inserted || [])].sort((a, b) => {
    if (a.round_number !== b.round_number) return a.round_number - b.round_number;
    return a.match_number - b.match_number;
  });
  for (const m of orderedMatches) {
    if (playedSet.has(m.id)) continue;
    // Re-load this match to get current slot fills + linkage targets.
    const { data: current } = await client
      .from("cornhole_bracket_matches")
      .select(
        "id, slot1_participant_id, slot2_participant_id, is_bye, next_winner_match_id, next_winner_slot",
      )
      .eq("id", m.id)
      .single();
    if (!current) continue;

    const s1 = current.slot1_participant_id as string | null;
    const s2 = current.slot2_participant_id as string | null;

    let winnerId: string | null = null;
    let s1Score: number | null = null;
    let s2Score: number | null = null;

    if (current.is_bye) {
      // Bye — slot1 advances automatically (or whichever slot is filled).
      winnerId = s1 ?? s2;
    } else if (s1 && s2) {
      const s1Wins = Math.random() < 0.5;
      winnerId = s1Wins ? s1 : s2;
      s1Score = s1Wins ? 21 : randInt(10, 19);
      s2Score = s1Wins ? randInt(10, 19) : 21;
    } else if (s1 || s2) {
      // Only one slot filled — they advance unopposed.
      winnerId = s1 || s2;
    } else {
      // Neither slot filled yet — bracket linkage hasn't propagated. Skip;
      // the upstream match will fill it on its own pass.
      continue;
    }

    if (!winnerId) continue;

    await client
      .from("cornhole_bracket_matches")
      .update({
        winner_participant_id: winnerId,
        slot1_score: s1Score,
        slot2_score: s2Score,
      })
      .eq("id", current.id);

    // Advance winner to the next match's slot.
    if (current.next_winner_match_id && current.next_winner_slot) {
      const slotCol = current.next_winner_slot === 1
        ? "slot1_participant_id"
        : "slot2_participant_id";
      await client
        .from("cornhole_bracket_matches")
        .update({ [slotCol]: winnerId })
        .eq("id", current.next_winner_match_id);
    }

    playedSet.add(m.id);
  }

  return { inserted: insertRows.length, warnings };
}

export async function generateCornhole(
  client: Client,
  testTripId: string,
): Promise<GeneratorResult> {
  const warnings: string[] = [];
  let inserted = 0;
  const contests = await listTestEventContests(client, testTripId);
  const singles = contests.find((c) => c.contest_type === "cornhole_singles");
  const doubles = contests.find((c) => c.contest_type === "cornhole_doubles");

  if (!singles && !doubles) {
    return {
      module: "cornhole",
      inserted: 0,
      skipped: 0,
      warnings: ["No cornhole contests configured in the test event — skipping."],
    };
  }

  const { data: roster } = await client
    .from("event_participants")
    .select("user_id")
    .eq("trip_id", testTripId)
    .eq("on_roster", true);
  const userIds = (roster || []).map((r) => r.user_id as string);
  if (userIds.length < 2) {
    return {
      module: "cornhole",
      inserted: 0,
      skipped: (singles ? 1 : 0) + (doubles ? 1 : 0),
      warnings: ["Roster too small for cornhole — run roster generator first."],
    };
  }

  // ── Singles ──────────────────────────────────────────────────────
  if (singles) {
    // Ensure contest_participants exist for every Loozer (roster generator
    // skips cornhole_singles in some cases).
    const { data: existing } = await client
      .from("contest_participants")
      .select("user_id")
      .eq("contest_id", singles.id);
    const haveUsers = new Set((existing || []).map((r) => r.user_id as string));
    const toInsert = userIds.filter((id) => !haveUsers.has(id));
    if (toInsert.length > 0) {
      await client
        .from("contest_participants")
        .insert(toInsert.map((id) => ({ contest_id: singles.id, user_id: id })));
    }

    const result = await buildAndPlayBracket(client, singles.id, userIds);
    inserted += result.inserted;
    warnings.push(...result.warnings.map((w) => `Singles: ${w}`));
  }

  // ── Doubles ──────────────────────────────────────────────────────
  if (doubles) {
    // Wipe existing teams + bracket for an idempotent run.
    const { data: oldTeams } = await client
      .from("cornhole_teams")
      .select("id")
      .eq("contest_id", doubles.id);
    const oldTeamIds = (oldTeams || []).map((t) => t.id as string);
    if (oldTeamIds.length > 0) {
      // cornhole_team_members might exist
      try {
        await client
          .from("cornhole_team_members")
          .delete()
          .in("team_id", oldTeamIds);
      } catch {
        // optional
      }
      await client.from("cornhole_teams").delete().in("id", oldTeamIds);
    }

    const pairs = chunk(shuffle([...userIds]), 2).filter((p) => p.length === 2);
    if (pairs.length < 2) {
      warnings.push("Doubles: not enough Loozers to form 2+ pairs.");
    } else {
      const teamIds: string[] = [];
      for (const pair of pairs) {
        const { data: team, error: teamErr } = await client
          .from("cornhole_teams")
          .insert({ contest_id: doubles.id })
          .select("id")
          .single();
        if (teamErr || !team) {
          warnings.push(`Doubles team: ${teamErr?.message}`);
          continue;
        }
        const teamId = team.id as string;
        teamIds.push(teamId);
        // Insert team members. Table name might be cornhole_team_members.
        try {
          await client.from("cornhole_team_members").insert(
            pair.map((userId) => ({ team_id: teamId, user_id: userId })),
          );
        } catch {
          // If the table doesn't exist, continue without warning — sim
          // bracket can still be played by team_id alone.
        }
        inserted += 1;
      }
      const result = await buildAndPlayBracket(client, doubles.id, teamIds);
      inserted += result.inserted;
      warnings.push(...result.warnings.map((w) => `Doubles: ${w}`));
    }
  }

  return { module: "cornhole", inserted, skipped: 0, warnings };
}
