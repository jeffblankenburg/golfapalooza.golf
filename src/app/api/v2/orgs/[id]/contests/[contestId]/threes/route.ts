import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";
import { setThreesGame, clearThreesGame, saveThreesSettings, loadThreesSettings, setPendingAndOne } from "@/lib/v2/contests/threes-server";
import { THREES_EVENT_BY_KEY, type ThreesReactions } from "@/lib/v2/contests/threes";
import type { EspnGameInput } from "@/lib/v2/contests/pickem-server";

type Params = Promise<{ id: string; contestId: string }>;

/**
 * 3s and Ds control surface (admin-only). One POST, several actions:
 *   set_game   { game }         — pick the current ESPN game (replaces + resets events)
 *   clear_game                  — remove the game + events
 *   log_event  { team, event }  — append a scored event (team 'a'|'b', event key)
 *   undo                        — delete the most recent event
 *   reactions  { reactions }    — save the per-event reaction config
 */
export async function POST(request: Request, { params }: { params: Params }) {
  const { id: orgId, contestId } = await params;
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId)))
    return NextResponse.json({ error: "Admins only" }, { status: 403 });

  // Confirm the contest belongs to this org and is the right type.
  const { data: contest } = await admin
    .from("v2_contests")
    .select("id, contest_type, org_id")
    .eq("id", contestId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!contest || contest.contest_type !== "3s_and_ds")
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: {
    action?: string;
    game?: EspnGameInput;
    team?: "a" | "b" | null;
    event?: string;
    potential?: number;
    reactions?: ThreesReactions;
    streakCap?: number | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  switch (body.action) {
    case "set_game": {
      if (!body.game?.espnEventId) return NextResponse.json({ error: "Pick a game" }, { status: 400 });
      const r = await setThreesGame(admin, contestId, body.game);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    case "clear_game": {
      await clearThreesGame(admin, contestId);
      return NextResponse.json({ ok: true });
    }

    case "log_event": {
      const def = body.event ? THREES_EVENT_BY_KEY[body.event] : undefined;
      if (!def || (body.team !== "a" && body.team !== "b"))
        return NextResponse.json({ error: "Bad event" }, { status: 400 });
      const { data: matchup } = await admin
        .from("v2_matchups")
        .select("id")
        .eq("contest_id", contestId)
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!matchup) return NextResponse.json({ error: "No game set" }, { status: 400 });
      const { error } = await admin.from("v2_3s_events").insert({
        contest_id: contestId,
        matchup_id: matchup.id,
        team: body.team,
        event_type: def.key,
        points: def.points,
        result: def.result,
        created_by: userId,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      // A logged play resolves any pending And-1 (a made 3-/4-point play is the
      // free throw going in; other events only fire while nothing is pending).
      await setPendingAndOne(admin, contestId, null);
      return NextResponse.json({ ok: true });
    }

    case "and_one": {
      // Toggle the non-scoring "And 1" pending state for a team (null = dismiss).
      // `potential` (3|4) = whether a made FT completes a 3- or 4-point play.
      const team = body.team;
      if (team !== "a" && team !== "b" && team !== null)
        return NextResponse.json({ error: "Bad team" }, { status: 400 });
      const potential = body.potential === 4 ? 4 : 3;
      const { error } = await setPendingAndOne(admin, contestId, team ?? null, potential);
      if (error) return NextResponse.json({ error }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    case "undo": {
      const { data: last } = await admin
        .from("v2_3s_events")
        .select("id")
        .eq("contest_id", contestId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (last) await admin.from("v2_3s_events").delete().eq("id", last.id);
      return NextResponse.json({ ok: true });
    }

    case "reactions": {
      // Group-level config: saved against the org, used by EVERY 3s-and-Ds game.
      if (!body.reactions || typeof body.reactions !== "object")
        return NextResponse.json({ error: "Bad reactions" }, { status: 400 });
      const cap = body.streakCap !== undefined ? body.streakCap : (await loadThreesSettings(admin, orgId)).streakCap;
      const { error } = await saveThreesSettings(admin, orgId, body.reactions, cap, userId);
      if (error) return NextResponse.json({ error }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
