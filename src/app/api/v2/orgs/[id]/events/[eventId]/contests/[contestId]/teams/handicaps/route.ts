import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";
import { calculateCourseHandicapRaw } from "@/lib/v2/golf/calculator";

/**
 * Auto-calculate scramble team handicaps (#209, ports v1's calculate-handicaps).
 * Course Handicap per player = HI × (slope/113) + (rating − par), off the contest's
 * tee (the handicap basis for a custom mix). The team handicap weights members'
 * course handicaps by team size (best player first); each weight set sums to ~50%.
 *
 * Works on the CURRENT (possibly unsaved) teams: the client posts each team's key
 * + member ids and gets a handicap back per key. Admins only.
 */

const SCRAMBLE_WEIGHTS: Record<number, number[]> = {
  2: [0.35, 0.15],
  3: [0.25, 0.15, 0.10],
  4: [0.20, 0.15, 0.10, 0.05],
  5: [0.18, 0.14, 0.10, 0.05, 0.03],
};
function weightsFor(n: number): number[] {
  if (SCRAMBLE_WEIGHTS[n]) return SCRAMBLE_WEIGHTS[n];
  if (n <= 1) return [1];
  return Array.from({ length: n }, () => 0.5 / n); // even fallback for odd sizes
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string; eventId: string; contestId: string }> }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: orgId, eventId, contestId } = await params;

  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const { data: contest } = await admin
    .from("v2_contests").select("id, tee_id").eq("id", contestId).eq("org_id", orgId).eq("event_id", eventId).maybeSingle();
  if (!contest) return NextResponse.json({ error: "Contest not found" }, { status: 404 });
  if (!contest.tee_id) return NextResponse.json({ error: "Set a tee for this contest first (Settings)." }, { status: 400 });

  const { data: tee } = await admin
    .from("v2_course_tees").select("tee_name, course_rating, slope_rating, par").eq("id", contest.tee_id).maybeSingle();
  if (!tee || tee.course_rating == null || tee.slope_rating == null) {
    return NextResponse.json({ error: "The selected tee has no rating/slope on file." }, { status: 400 });
  }

  let body: { teams?: { key: string; members: string[] }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const teams = Array.isArray(body.teams) ? body.teams : [];

  const allIds = [...new Set(teams.flatMap((t) => t.members || []))];
  const hiByUser = new Map<string, number>();
  if (allIds.length) {
    const { data: rows } = await admin.from("v2_player_handicaps").select("user_id, handicap_index").in("user_id", allIds);
    for (const r of rows || []) if (r.handicap_index != null) hiByUser.set(r.user_id as string, r.handicap_index as number);
  }

  const rating = tee.course_rating as number;
  const slope = tee.slope_rating as number;
  const par = tee.par as number;

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const handicaps: Record<string, number> = {};
  const breakdowns: Record<string, {
    team_handicap: number;
    members: { user_id: string; handicap_index: number | null; course_handicap: number; weight: number; contribution: number }[];
  }> = {};
  const missing = new Set<string>();

  for (const t of teams) {
    const rows = (t.members || [])
      .map((uid) => {
        const hi = hiByUser.get(uid);
        if (hi == null) missing.add(uid);
        return { user_id: uid, hi: hi ?? null, ch: calculateCourseHandicapRaw(hi ?? 0, slope, rating, par) };
      })
      .sort((a, b) => a.ch - b.ch); // best (lowest) first — weights taper by rank
    const w = weightsFor(rows.length);
    let total = 0;
    const members = rows.map((row, i) => {
      const weight = w[i] ?? 0;
      const contribution = row.ch * weight;
      total += contribution;
      return { user_id: row.user_id, handicap_index: row.hi, course_handicap: r2(row.ch), weight, contribution: r2(contribution) };
    });
    handicaps[t.key] = Math.round(total);
    breakdowns[t.key] = { team_handicap: Math.round(total), members };
  }

  return NextResponse.json({ handicaps, breakdowns, tee_name: tee.tee_name, missing: [...missing] });
}
