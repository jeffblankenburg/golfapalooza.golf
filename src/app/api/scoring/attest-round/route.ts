import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId } from "@/lib/simulator";

/**
 * @swagger
 * /api/scoring/attest-round:
 *   post:
 *     summary: Self-attest a scramble team's round as final and verified
 *     description: Any member of a scramble team can call this once all 18 holes
 *       are scored. Sets verified_at + verified_by, locking the scorecard.
 *       Admins can later unverify via /api/admin/scramble/verify if a correction
 *       is needed.
 *     tags: [Rounds]
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const effectiveUserId = await getEffectiveUserId(user.id);

  try {
    const { team_id } = await request.json();

    if (!team_id) {
      return NextResponse.json(
        { error: "team_id is required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    const { data: membership } = await adminClient
      .from("scramble_team_members")
      .select("id, team:scramble_teams(id, verified_at, contest:contests(scoring_closed_at))")
      .eq("team_id", team_id)
      .eq("user_id", effectiveUserId)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json(
        { error: "Not a member of this team" },
        { status: 403 }
      );
    }

    const teamData = Array.isArray(membership.team)
      ? membership.team[0]
      : membership.team;
    if (!teamData) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }
    if (teamData.verified_at) {
      // Idempotent — return success with the existing timestamp.
      return NextResponse.json({
        success: true,
        verified_at: teamData.verified_at,
        already_verified: true,
      });
    }

    const contestData = Array.isArray(teamData.contest)
      ? teamData.contest[0]
      : teamData.contest;
    if (contestData?.scoring_closed_at) {
      return NextResponse.json(
        { error: "Scoring is closed for this contest" },
        { status: 403 }
      );
    }

    // Sanity: require all 18 holes scored before the team can self-attest.
    const { count: scoreCount, error: countErr } = await adminClient
      .from("scramble_hole_scores")
      .select("hole_number", { count: "exact", head: true })
      .eq("team_id", team_id);

    if (countErr) {
      return NextResponse.json({ error: countErr.message }, { status: 500 });
    }

    if ((scoreCount ?? 0) < 18) {
      return NextResponse.json(
        { error: "All 18 holes must be scored before completing the round" },
        { status: 400 }
      );
    }

    const verifiedAt = new Date().toISOString();
    const { error: updateErr } = await adminClient
      .from("scramble_teams")
      .update({ verified_at: verifiedAt, verified_by: effectiveUserId })
      .eq("id", team_id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      verified_at: verifiedAt,
      verified_by: effectiveUserId,
    });
  } catch (error) {
    console.error("Attest round error:", error);
    return NextResponse.json(
      { error: "Failed to attest round" },
      { status: 500 }
    );
  }
}
