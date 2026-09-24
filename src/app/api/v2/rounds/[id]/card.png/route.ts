import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { formatCourseName } from "@/lib/v2/course-display";
import { pickName, type NameMode } from "@/lib/v2/profile";
import { ScorecardImage, scorecardSize, type CardPlayer } from "@/lib/v2/rounds/scorecard-image";

/**
 * GET /api/v2/rounds/[id]/card.png — a shareable group scorecard PNG (#204),
 * rendered on demand (never persisted). Every player appears (guests included for
 * context); the requesting viewer's row is highlighted. Auth-gated — no MMS, so it
 * needn't be public.
 */
export const dynamic = "force-dynamic";

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = v2AdminClient();
  const { data: round } = await admin
    .from("v2_rounds")
    .select(
      `id, org_id, round_date, round_type, format,
       course:v2_courses(name, club_name),
       tee:v2_course_tees(tee_name, par),
       players:v2_round_players(id, user_id, guest_name, tee_id, player_position, final_gross_score,
         profile:v2_profiles(display_name, first_name, last_name, nickname, avatar_url))`,
    )
    .eq("id", id)
    .order("player_position", { referencedTable: "players", ascending: true })
    .maybeSingle();
  if (!round) return NextResponse.json({ error: "Round not found" }, { status: 404 });

  const org = round.org_id
    ? one(
        (
          await admin
            .from("v2_organizations")
            .select("name, logo_url, primary_color, name_display")
            .eq("id", round.org_id)
            .maybeSingle()
        ).data,
      )
    : null;
  const nameMode: NameMode = (org?.name_display as NameMode) || "nickname";

  const playerRows = round.players || [];
  const gridTeeId = (playerRows.find((p) => p.user_id === userId) ?? playerRows[0])?.tee_id ?? round.players?.[0]?.tee_id;

  const inNine = (h: number) =>
    round.round_type === "9-front" ? h <= 9 : round.round_type === "9-back" ? h >= 10 : true;

  const { data: holeRows } = gridTeeId
    ? await admin
        .from("v2_course_holes")
        .select("hole_number, par, yards, handicap_index")
        .eq("tee_id", gridTeeId)
        .order("hole_number", { ascending: true })
    : { data: [] };
  const holes = (holeRows || [])
    .filter((h) => inNine(h.hole_number))
    .map((h) => ({ hole_number: h.hole_number, par: h.par, yards: h.yards ?? null, handicap_index: h.handicap_index ?? null }));
  const parTotal = holes.reduce((s, h) => s + h.par, 0);

  const { data: scoreRows } = await admin
    .from("v2_round_scores")
    .select("round_player_id, hole_number, strokes, putts")
    .eq("round_id", id);
  const byPlayer = new Map<string, Map<number, { strokes: number | null; putts: number | null }>>();
  for (const s of scoreRows || []) {
    if (!inNine(s.hole_number)) continue;
    const m = byPlayer.get(s.round_player_id) || new Map();
    m.set(s.hole_number, { strokes: s.strokes ?? null, putts: s.putts ?? null });
    byPlayer.set(s.round_player_id, m);
  }

  const isScramble = round.format === "scramble";

  // Each player's tee color, for the dot beside their name (tees can differ).
  const teeIds = [...new Set(playerRows.map((p) => p.tee_id).filter((t): t is string => !!t))];
  const { data: teeRows } = teeIds.length
    ? await admin.from("v2_course_tees").select("id, tee_color").in("id", teeIds)
    : { data: [] };
  const teeColorById = new Map((teeRows || []).map((t) => [t.id, t.tee_color]));

  const toRow = (p: (typeof playerRows)[number], name: string): CardPlayer => {
    const scores = byPlayer.get(p.id) || new Map();
    const cells = holes.map((h) => scores.get(h.hole_number) || { strokes: null, putts: null });
    const summed = cells.reduce((s, c) => (c.strokes != null ? s + c.strokes : s), 0);
    const total = p.final_gross_score ?? (summed > 0 ? summed : null);
    const teeColor = p.tee_id ? teeColorById.get(p.tee_id) ?? null : null;
    return { name, teeColor, total, toPar: total != null ? total - parTotal : null, cells };
  };

  const players: CardPlayer[] = isScramble
    ? playerRows[0]
      ? [toRow(playerRows[0], "Team")]
      : []
    : playerRows.map((p) => {
        const prof = one(p.profile);
        const name = p.user_id ? (prof ? pickName(prof, nameMode) : "Player") : `${p.guest_name || "Guest"}`;
        return toRow(p, name);
      });

  const course = one(round.course);
  const [y, m, dd] = (round.round_date || "").split("-").map(Number);
  // Just the date — tee is shown per-player via the dots; hole count is evident.
  const subtitle = y
    ? new Date(y, (m || 1) - 1, dd || 1).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";

  const { width, height } = scorecardSize(holes, players.length);

  return new ImageResponse(
    ScorecardImage({
      orgName: org?.name ?? null,
      logoUrl: org?.logo_url ?? null,
      accent: org?.primary_color || "#15803d",
      courseName: course ? formatCourseName(course) : "Round",
      subtitle,
      holes,
      parTotal,
      players,
    }),
    { width, height, headers: { "Cache-Control": "private, max-age=300" } },
  );
}
