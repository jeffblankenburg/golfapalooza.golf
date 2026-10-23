import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { formatCourseName } from "@/lib/v2/course-display";
import { orgSlug, clearRoundActivity, logLiveRound } from "@/lib/v2/rounds/round-activity";

/**
 * POST — resume a set-aside (`abandoned`) round so the golfer can keep scoring.
 * Flips status back to `in_progress` and (for a non-silent group round) re-posts
 * the single LIVE activity entry so it reappears in the feed / "other groups."
 * Co-equal ownership: the creator or any player on the round may resume it.
 * Idempotent-ish — resuming an already in-progress round just re-asserts live.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: roundId } = await params;

  const admin = v2AdminClient();
  const { data: round } = await admin
    .from("v2_rounds")
    .select("id, status, created_by, org_id, silent, course_id")
    .eq("id", roundId)
    .maybeSingle();
  if (!round) return NextResponse.json({ error: "Round not found" }, { status: 404 });
  if (round.status === "completed") {
    return NextResponse.json({ error: "This round is already completed" }, { status: 409 });
  }

  const { data: roster } = await admin
    .from("v2_round_players")
    .select("user_id, guest_name, player_position")
    .eq("round_id", roundId)
    .order("player_position", { ascending: true });
  const isPlayer = (roster || []).some((r) => r.user_id === userId);
  if (round.created_by !== userId && !isPlayer) {
    return NextResponse.json({ error: "Only players in this round can resume it" }, { status: 403 });
  }

  const { error: statusErr } = await admin
    .from("v2_rounds")
    .update({ status: "in_progress", completed_at: null })
    .eq("id", roundId);
  if (statusErr) return NextResponse.json({ error: statusErr.message }, { status: 500 });

  // Re-post the LIVE feed entry (best-effort), matching the create flow. Silent
  // and org-less rounds never had one, so skip them.
  if (round.org_id && !round.silent) {
    const [{ data: courseRow }, slug] = await Promise.all([
      admin.from("v2_courses").select("name, club_name").eq("id", round.course_id).maybeSingle(),
      orgSlug(admin, round.org_id),
    ]);
    if (slug) {
      const courseName = courseRow ? formatCourseName(courseRow) : "a round";
      const loozerIds = (roster || []).map((r) => r.user_id).filter((u): u is string => !!u);
      const { data: profs } = loozerIds.length
        ? await admin.from("v2_profiles").select("id, display_name").in("id", loozerIds)
        : { data: [] as { id: string; display_name: string }[] };
      const nameById = new Map((profs || []).map((p) => [p.id, p.display_name]));
      const names = (roster || []).map((r) => (r.user_id ? nameById.get(r.user_id) || "Player" : r.guest_name || "Guest"));
      // Clear any stray entry first so a resume never double-posts.
      await clearRoundActivity(admin, roundId);
      await logLiveRound(admin, { orgId: round.org_id, slug, roundId, creatorId: round.created_by, courseName, subtitle: names.join(", ") });
    }
  }

  return NextResponse.json({ success: true });
}
