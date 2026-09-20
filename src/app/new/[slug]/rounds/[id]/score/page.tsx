import { redirect } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import { v2AdminClient } from "@/lib/v2/supabase";
import { pickName } from "@/lib/v2/profile";
import { formatCourseName } from "@/lib/v2/course-display";
import ScoreEntry, { type ScoreHole, type ScorePlayer } from "./ScoreEntry";

type StatKey = "putts" | "fairways" | "gir" | "penalties";
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/**
 * Full-screen hole-by-hole / live scorer for a v2 round. Personal & global —
 * gated to players on the round (or its creator). Outside the (event) route
 * group so it renders full-screen without the shell nav.
 */
export default async function ScorePage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect(`/new/signup?org=${encodeURIComponent(slug)}`);
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/new");

  const admin = v2AdminClient();
  const { data: round } = await admin
    .from("v2_rounds")
    .select("id, status, round_type, format, created_by, tee_id, course:v2_courses(name, club_name)")
    .eq("id", id)
    .maybeSingle();
  if (!round) redirect(`/new/${slug}`);

  const { data: roster } = await admin
    .from("v2_round_players")
    .select("id, user_id, guest_name, tee_id, player_position, profile:v2_profiles(display_name, first_name, last_name, nickname), player_tee:v2_course_tees!v2_round_players_tee_id_fkey(tee_name, tee_color)")
    .eq("round_id", id)
    .order("player_position", { ascending: true });

  const isPlayer = (roster || []).some((r) => r.user_id === ctx.userId);
  if (round.created_by !== ctx.userId && !isPlayer) redirect(`/new/${slug}`);

  // Holes from the round tee (composition-tee resolution is a TODO), filtered to
  // the round's nine.
  const inNine = (h: number) => (round.round_type === "9-front" ? h <= 9 : round.round_type === "9-back" ? h >= 10 : true);
  const { data: holeRows } = round.tee_id
    ? await admin
        .from("v2_course_holes")
        .select("hole_number, par, handicap_index, yards, hole_name")
        .eq("tee_id", round.tee_id)
        .order("hole_number", { ascending: true })
    : { data: [] };
  const holes: ScoreHole[] = (holeRows || [])
    .filter((h) => inNine(h.hole_number))
    .map((h) => ({ hole_number: h.hole_number, par: h.par, handicap_index: h.handicap_index, yards: h.yards ?? null, hole_name: h.hole_name ?? null }));

  const players: ScorePlayer[] = (roster || []).map((r) => {
    const prof = one(r.profile);
    const tee = one(r.player_tee);
    return {
      id: r.id,
      name: r.user_id ? pickName(prof, org.name_display) : r.guest_name || "Guest",
      isGuest: !r.user_id,
      teeName: tee?.tee_name ?? null,
      teeColor: tee?.tee_color ?? null,
    };
  });

  // Existing scores, grouped by round_player_id.
  const { data: scoreRows } = await admin
    .from("v2_round_scores")
    .select("round_player_id, hole_number, strokes, putts, fairway_hit, green_in_regulation, penalty_strokes")
    .eq("round_id", id);
  const initialScores: Record<string, Record<number, { strokes: number | null; putts: number | null; fairway_hit: boolean | null; green_in_regulation: boolean | null; penalty_strokes: number | null }>> = {};
  for (const s of scoreRows || []) {
    (initialScores[s.round_player_id] ||= {})[s.hole_number] = {
      strokes: s.strokes,
      putts: s.putts,
      fairway_hit: s.fairway_hit,
      green_in_regulation: s.green_in_regulation,
      penalty_strokes: s.penalty_strokes,
    };
  }

  const { data: me } = await admin.from("v2_profiles").select("tracked_stats").eq("id", ctx.userId).maybeSingle();
  const allowed: StatKey[] = ["putts", "fairways", "gir", "penalties"];
  const trackedStats = (Array.isArray(me?.tracked_stats) ? me!.tracked_stats : ["putts"]).filter((s: unknown): s is StatKey =>
    typeof s === "string" && (allowed as string[]).includes(s),
  );

  const course = one(round.course);

  return (
    <div style={{ ["--brand" as string]: org.primary_color || "#0a5c36" } as React.CSSProperties}>
      <ScoreEntry
        slug={slug}
        roundId={round.id}
        courseName={course ? formatCourseName(course) : "Round"}
        holes={holes}
        players={players}
        initialScores={initialScores}
        trackedStats={trackedStats}
        initialStatus={round.status}
        viewerId={ctx.userId}
        orgId={org.id}
      />
    </div>
  );
}
