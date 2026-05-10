/**
 * @swagger
 * /api/admin/sim/state:
 *   get:
 *     summary: Issue #128 — current per-module status of the test event
 *     description: |
 *       Row counts per module table, scoped to the test event. Lets the
 *       /admin/simulator UI render "Roster: 32 Loozers" / "Scramble: 8
 *       teams × 18 holes" status pills next to each module. Returns an
 *       inactive payload when sim mode is off.
 *     tags: [Admin]
 *     responses:
 *       200: { description: Per-module counts }
 *       401: { description: Unauthorized }
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSimTripId } from "@/lib/simulator";

async function checkAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  return profile?.is_admin ? user : null;
}

async function countByTrip(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  table: string,
  testTripId: string,
): Promise<number> {
  const { count } = await client
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("trip_id", testTripId);
  return count ?? 0;
}

async function countByContest(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  table: string,
  contestIds: string[],
): Promise<number> {
  if (contestIds.length === 0) return 0;
  const { count } = await client
    .from(table)
    .select("id", { count: "exact", head: true })
    .in("contest_id", contestIds);
  return count ?? 0;
}

export async function GET() {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const simTripId = await getSimTripId();
  if (!simTripId) {
    return NextResponse.json({ active: false });
  }

  const admin = createAdminClient();
  const { data: contests } = await admin
    .from("contests")
    .select("id, contest_type")
    .eq("trip_id", simTripId);

  const contestIds = (contests || []).map((c) => c.id as string);
  const contestTypes = new Map<string, string[]>();
  for (const c of contests || []) {
    const list = contestTypes.get(c.contest_type as string) || [];
    list.push(c.id as string);
    contestTypes.set(c.contest_type as string, list);
  }

  const [
    eventParticipants,
    contestParticipants,
    scrambleTeams,
    hundredFeet,
  ] = await Promise.all([
    countByTrip(admin, "event_participants", simTripId),
    countByContest(admin, "contest_participants", contestIds),
    countByContest(admin, "scramble_teams", contestTypes.get("scramble") || []),
    countByTrip(admin, "hundred_feet_scores", simTripId),
  ]);

  return NextResponse.json({
    active: true,
    testTripId: simTripId,
    contestCount: contestIds.length,
    modules: {
      roster: { event_participants: eventParticipants, contest_participants: contestParticipants },
      scramble: { scramble_teams: scrambleTeams },
      hundred_feet: { hundred_feet_scores: hundredFeet },
      // Phase 2/3 modules surface here as their generators land.
    },
  });
}
