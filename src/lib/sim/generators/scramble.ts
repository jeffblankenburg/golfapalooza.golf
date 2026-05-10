/**
 * Issue #128 — scramble teams + hole scores generator.
 *
 * For every scramble contest in the test event:
 *   1. Auto-team the rostered Loozers into 4-player teams (last team
 *      may have 3 or 5 — naturally absorbed by integer division).
 *   2. Compute each team's `team_handicap` as the rounded average of
 *      member indices (default 18 if a member has no recorded index).
 *   3. Generate 18 hole scores per team, weighted around par.
 *   4. Sum to `gross_score` and store on the team row.
 *
 * After writing, materializers run for the scramble + any child Skins
 * contest so `contest_winners` converges to the right shape.
 *
 * Pars come from `course_holes` joined via `contest_hole_tees`. If the
 * contest has no per-hole tee assignments, every hole defaults to par 4
 * — Phase 1 simplification, fine for verifying the rendering path.
 *
 * Idempotent: wipes existing teams/members/scores/winners for the
 * scramble contests first, then re-inserts.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  listTestEventContests,
  weightedPick,
  shuffle,
  chunk,
} from "../shared";
import type { GeneratorResult } from "../types";
import { materializeContestWinners } from "@/lib/winners/materialize";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, "public", any>;

const TEAM_SIZE = 4;
const DEFAULT_INDEX = 18;
const FALLBACK_PAR = 4;

/**
 * Per-hole score distribution relative to par. ~70% par, 15% bogey,
 * 10% birdie, 5% double-or-worse. Captures the realistic scramble shape
 * better than uniform random.
 */
function pickStrokesForPar(par: number): number {
  const offset = weightedPick<number>([
    [0, 70], // par
    [1, 15], // bogey
    [-1, 10], // birdie
    [2, 4], // double
    [-2, 1], // eagle
  ]);
  // Clamp to the [1, 20] check constraint on scramble_hole_scores.
  return Math.max(1, Math.min(20, par + offset));
}

interface RosterMember {
  user_id: string;
  handicap_index: number;
}

async function loadRoster(
  client: Client,
  testTripId: string,
): Promise<RosterMember[]> {
  const { data: roster } = await client
    .from("event_participants")
    .select("user_id")
    .eq("trip_id", testTripId)
    .eq("on_roster", true);

  const userIds = (roster || []).map((r) => r.user_id as string);
  if (userIds.length === 0) return [];

  const { data: hcps } = await client
    .from("player_handicaps")
    .select("user_id, handicap_index")
    .in("user_id", userIds);

  const hcpMap = new Map<string, number>();
  for (const h of hcps || []) {
    hcpMap.set(h.user_id as string, Number(h.handicap_index) || DEFAULT_INDEX);
  }

  return userIds.map((id) => ({
    user_id: id,
    handicap_index: hcpMap.get(id) ?? DEFAULT_INDEX,
  }));
}

async function loadPars(
  client: Client,
  contestId: string,
): Promise<Map<number, number>> {
  // Pars come via the contest's per-hole tee assignment → course_holes.
  const { data: tees } = await client
    .from("contest_hole_tees")
    .select("hole_number, tee_id")
    .eq("contest_id", contestId)
    .order("hole_number");

  if (!tees || tees.length === 0) return new Map();

  const teeIds = [...new Set(tees.map((t) => t.tee_id as string))];
  const { data: holes } = await client
    .from("course_holes")
    .select("tee_id, hole_number, par")
    .in("tee_id", teeIds);

  const parByTeeHole = new Map<string, number>();
  for (const h of holes || []) {
    parByTeeHole.set(`${h.tee_id}-${h.hole_number}`, h.par as number);
  }

  const out = new Map<number, number>();
  for (const t of tees) {
    const par = parByTeeHole.get(`${t.tee_id}-${t.hole_number}`) ?? FALLBACK_PAR;
    out.set(t.hole_number as number, par);
  }
  return out;
}

async function wipeExistingScramble(
  client: Client,
  scrambleContestIds: string[],
): Promise<void> {
  if (scrambleContestIds.length === 0) return;

  const { data: teams } = await client
    .from("scramble_teams")
    .select("id")
    .in("contest_id", scrambleContestIds);
  const teamIds = (teams || []).map((t) => t.id as string);

  if (teamIds.length > 0) {
    await client.from("scramble_hole_scores").delete().in("team_id", teamIds);
    await client.from("scramble_team_members").delete().in("team_id", teamIds);
  }
  await client.from("scramble_teams").delete().in("contest_id", scrambleContestIds);
  // Also clear any materialized winners on these contests.
  await client
    .from("contest_winners")
    .delete()
    .in("contest_id", scrambleContestIds);
}

export async function generateScramble(
  client: Client,
  testTripId: string,
): Promise<GeneratorResult> {
  const warnings: string[] = [];
  const contests = await listTestEventContests(client, testTripId);
  const scrambles = contests.filter((c) => c.contest_type === "scramble");

  if (scrambles.length === 0) {
    return {
      module: "scramble",
      inserted: 0,
      skipped: 0,
      warnings: ["No scramble contests configured in the test event — skipping."],
    };
  }

  const roster = await loadRoster(client, testTripId);
  if (roster.length < 2) {
    return {
      module: "scramble",
      inserted: 0,
      skipped: scrambles.length,
      warnings: ["Roster is empty or too small — run the roster generator first."],
    };
  }

  // Idempotent: wipe existing teams/scores for these scrambles.
  await wipeExistingScramble(
    client,
    scrambles.map((c) => c.id),
  );

  let totalInserted = 0;
  let totalSkipped = 0;

  for (const contest of scrambles) {
    const pars = await loadPars(client, contest.id);
    if (pars.size === 0) {
      warnings.push(
        `${contest.name}: no per-hole tee assignment found — generating with par-4 defaults.`,
      );
      for (let i = 1; i <= 18; i++) pars.set(i, FALLBACK_PAR);
    }

    // Different shuffle per scramble so teams aren't identical across days.
    const teamMembers = chunk(shuffle([...roster]), TEAM_SIZE);

    for (const members of teamMembers) {
      if (members.length === 0) continue;
      const avgIndex = members.reduce((sum, m) => sum + m.handicap_index, 0) / members.length;
      const teamHandicap = Math.round(avgIndex);

      // Insert the team row first to get its id.
      const { data: teamRow, error: teamErr } = await client
        .from("scramble_teams")
        .insert({
          contest_id: contest.id,
          team_handicap: teamHandicap,
          course_par: [...pars.values()].reduce((s, p) => s + p, 0),
        })
        .select("id")
        .single();
      if (teamErr || !teamRow) {
        warnings.push(`${contest.name}: failed to insert team — ${teamErr?.message}`);
        totalSkipped += 1;
        continue;
      }
      const teamId = teamRow.id as string;

      // Members
      const memberRows = members.map((m) => ({ team_id: teamId, user_id: m.user_id }));
      const { error: memErr } = await client.from("scramble_team_members").insert(memberRows);
      if (memErr) {
        warnings.push(`${contest.name}: failed to insert members — ${memErr.message}`);
      }
      totalInserted += memberRows.length + 1;

      // Generate 18 hole scores.
      const scoreRows: { team_id: string; hole_number: number; strokes: number }[] = [];
      let gross = 0;
      for (let hole = 1; hole <= 18; hole++) {
        const par = pars.get(hole) ?? FALLBACK_PAR;
        const strokes = pickStrokesForPar(par);
        scoreRows.push({ team_id: teamId, hole_number: hole, strokes });
        gross += strokes;
      }
      const { error: scoreErr } = await client.from("scramble_hole_scores").insert(scoreRows);
      if (scoreErr) {
        warnings.push(`${contest.name}: failed to insert hole scores — ${scoreErr.message}`);
      }
      totalInserted += scoreRows.length;

      // Store the gross_score on the team so leaderboards + materializers
      // can rank without re-summing.
      await client.from("scramble_teams").update({ gross_score: gross }).eq("id", teamId);
    }
  }

  // Materialize winners for every scramble contest, then any Skins child
  // that points at one of them.
  for (const contest of scrambles) {
    await materializeContestWinners(client, contest.id).catch((err) => {
      warnings.push(`${contest.name}: materialize failed — ${(err as Error).message}`);
    });
  }
  const skinsChildren = contests.filter(
    (c) =>
      c.contest_type === "scramble_skins" &&
      c.parent_contest_id &&
      scrambles.some((s) => s.id === c.parent_contest_id),
  );
  for (const skins of skinsChildren) {
    await materializeContestWinners(client, skins.id).catch((err) => {
      warnings.push(`${skins.name}: skins materialize failed — ${(err as Error).message}`);
    });
  }

  return {
    module: "scramble",
    inserted: totalInserted,
    skipped: totalSkipped,
    warnings,
  };
}
