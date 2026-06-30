import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId } from "@/lib/simulator";
import { checkIsAdmin } from "@/lib/permissions-server";
import { resolveHolesForTee } from "@/lib/golf/composition-tees";
import RoundEditor, {
  type EditorHole,
  type EditorPlayer,
  type EditorTee,
} from "@/components/my-rounds/RoundEditor";
import { BTN_BACK } from "@/lib/ui/buttons";

export default async function EditRoundPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: roundId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const effectiveUserId = await getEffectiveUserId(user.id);
  const admin = createAdminClient();

  const { data: round } = await admin
    .from("rounds")
    .select(`
      id,
      round_date,
      round_type,
      status,
      created_by,
      course_id,
      course:courses(id, name),
      round_players(
        id,
        user_id,
        guest_name,
        tee_id,
        user:users(id, display_name),
        scores:round_scores(hole_number, strokes, putts)
      )
    `)
    .eq("id", roundId)
    .single();

  if (!round) {
    redirect(`/my-rounds`);
  }

  if (round.status !== "completed") {
    // In-progress rounds use the live scoring flow.
    redirect(`/my-rounds/rounds/${roundId}/live`);
  }

  const isCreator = round.created_by === effectiveUserId;
  const adminUser = isCreator ? null : await checkIsAdmin();
  if (!isCreator && !adminUser) {
    redirect(`/my-rounds/rounds/${roundId}`);
  }

  // Available tees on the round's course (for the per-player picker).
  const { data: tees } = await admin
    .from("course_tees")
    .select("id, tee_name, tee_color, course_rating, slope_rating, par")
    .eq("course_id", round.course_id)
    .order("course_rating", { ascending: false });

  const availableTees: EditorTee[] = (tees || []) as EditorTee[];

  // Holes for the editor — use the round's primary tee so the grid shows par
  // values. Per-player tee changes still recalc against that player's tee on
  // the server; the displayed par is best-effort guidance, not authoritative.
  const { data: rawHoles } = await resolveHolesForTee(
    supabase,
    (round.round_players?.[0]?.tee_id) || availableTees[0]?.id,
    "hole_number, par, handicap_index",
  );
  const holes: EditorHole[] = ((rawHoles as unknown) as EditorHole[] | null) || [];

  const players: EditorPlayer[] = (round.round_players || []).map((rp: {
    id: string;
    guest_name: string | null;
    tee_id: string;
    user: { display_name: string } | { display_name: string }[] | null;
    scores: { hole_number: number; strokes: number; putts: number | null }[];
  }) => {
    const u = Array.isArray(rp.user) ? rp.user[0] : rp.user;
    const scores: Record<number, { strokes: number | null; putts: number | null }> = {};
    for (const s of rp.scores || []) {
      scores[s.hole_number] = { strokes: s.strokes, putts: s.putts };
    }
    return {
      round_player_id: rp.id,
      display_name: u?.display_name || rp.guest_name || "Player",
      initial_tee_id: rp.tee_id,
      scores,
    };
  });

  const course = Array.isArray(round.course) ? round.course[0] : round.course;

  return (
    <div>
      <div className="px-4 pt-4">
        <Link href={`/my-rounds/rounds/${roundId}`} className={BTN_BACK}>← Scorecard</Link>
      </div>
      <RoundEditor
        roundId={roundId}
        initialRoundDate={round.round_date}
        roundType={round.round_type}
        courseName={course?.name || "Unknown Course"}
        holes={holes}
        availableTees={availableTees}
        players={players}
      />
    </div>
  );
}
