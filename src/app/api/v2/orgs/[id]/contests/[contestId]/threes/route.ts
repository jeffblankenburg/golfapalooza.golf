import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";
import { setThreesGame, clearThreesGame, saveThreesSettings, loadThreesSettings, setPendingAndOne } from "@/lib/v2/contests/threes-server";
import { THREES_EVENT_BY_KEY, pickFromBag, type ThreesReactions, type GifBags } from "@/lib/v2/contests/threes";
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
    .select("id, contest_type, org_id, config")
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

      // Pick this play's GIF once (no-repeat shuffle bag per reaction type), so
      // every board shows the same one. Bag state lives in the contest config.
      const cfg = (contest.config as Record<string, unknown> | null) ?? {};
      const eventGifs = (await loadThreesSettings(admin, orgId)).reactions[def.key]?.gifs ?? [];
      const picked = pickFromBag((cfg.gif_bags as GifBags) ?? {}, def.key, eventGifs);

      const { error } = await admin.from("v2_3s_events").insert({
        contest_id: contestId,
        matchup_id: matchup.id,
        team: body.team,
        event_type: def.key,
        points: def.points,
        result: def.result,
        gif_url: picked.gif,
        created_by: userId,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // One config write: persist the bag, and clear any pending And-1 (a made
      // 3-/4-point play is the free throw going in; other events only fire while
      // nothing is pending).
      const nextCfg: Record<string, unknown> = { ...cfg, gif_bags: picked.bags };
      delete nextCfg.and_one;
      await admin.from("v2_contests").update({ config: nextCfg }).eq("id", contestId);
      return NextResponse.json({ ok: true });
    }

    case "and_one": {
      // Toggle the non-scoring "And 1" pending state for a team (null = dismiss).
      // `potential` (3|4) = whether a made FT completes a 3- or 4-point play.
      const team = body.team;
      if (team !== "a" && team !== "b" && team !== null)
        return NextResponse.json({ error: "Bad team" }, { status: 400 });
      if (!team) {
        const { error } = await setPendingAndOne(admin, contestId, null);
        if (error) return NextResponse.json({ error }, { status: 500 });
        return NextResponse.json({ ok: true });
      }
      // Raise: the And-1 GIF comes from the same no-repeat shuffle bag, chosen
      // once here so every board shows the same one. Write and_one + bag together.
      const potential = body.potential === 4 ? 4 : 3;
      const cfg = (contest.config as Record<string, unknown> | null) ?? {};
      const gifs = (await loadThreesSettings(admin, orgId)).reactions.and_one?.gifs ?? [];
      const picked = pickFromBag((cfg.gif_bags as GifBags) ?? {}, "and_one", gifs);
      const nextCfg = { ...cfg, gif_bags: picked.bags, and_one: { team, potential, gif: picked.gif } };
      const { error } = await admin.from("v2_contests").update({ config: nextCfg }).eq("id", contestId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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
