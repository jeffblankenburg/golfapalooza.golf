import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId } from "@/lib/simulator";
import { checkIsAdmin } from "@/lib/permissions-server";
import { resolveHolesForTee } from "@/lib/golf/composition-tees";
import { BTN_BACK } from "@/lib/ui/buttons";
import {
  LiveScoreboard,
  type ScoreboardPlayer,
  type ScoreboardHole,
} from "@/components/rounds/LiveScoreboard";
import { RoundComments } from "@/components/rounds/RoundComments";
import { AdminDeleteRoundButton } from "@/components/rounds/AdminDeleteRoundButton";

// Read-only spectator view for any round (issue #140). Watchable by any
// signed-in Loozer — this is where favorite notifications deep-link. Live
// rounds update in realtime; completed rounds render the final card.
export default async function WatchRoundPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: round } = await admin
    .from("rounds")
    .select(
      `
      id, round_type, status, tee_id,
      course:courses(name),
      round_players(
        id, user_id, guest_name, tee_id, player_position,
        user:users(id, display_name),
        scores:round_scores(hole_number, strokes)
      )
    `
    )
    .eq("id", id)
    .order("player_position", { referencedTable: "round_players", ascending: true })
    .single();

  if (!round) notFound();

  const effectiveUserId = await getEffectiveUserId(user.id);
  const isAdmin = !!(await checkIsAdmin());

  const course = Array.isArray(round.course) ? round.course[0] : round.course;

  const { data: holeRows } = await resolveHolesForTee(
    admin,
    round.tee_id,
    "hole_number, par"
  );
  const holes: ScoreboardHole[] = ((holeRows || []) as {
    hole_number: number;
    par: number;
  }[]).map((h) => ({ hole_number: h.hole_number, par: h.par }));

  type RP = {
    id: string;
    user_id: string | null;
    guest_name: string | null;
    user: { id: string; display_name: string } | { id: string; display_name: string }[] | null;
    scores: { hole_number: number; strokes: number }[] | null;
  };

  const players: ScoreboardPlayer[] = ((round.round_players || []) as RP[]).map(
    (p) => {
      const u = p.user ? (Array.isArray(p.user) ? p.user[0] : p.user) : null;
      return {
        round_player_id: p.id,
        name: u?.display_name || p.guest_name || "Guest",
        is_guest: !p.user_id,
        scores: p.scores || [],
      };
    }
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 space-y-5">
      <div className="flex items-center justify-between gap-2">
        <Link href="/" className={BTN_BACK}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Home
        </Link>
        {isAdmin && (
          <AdminDeleteRoundButton
            roundId={round.id}
            label={course?.name || "this round"}
          />
        )}
      </div>

      <LiveScoreboard
        round={{
          id: round.id,
          round_type: round.round_type,
          status: round.status,
          course_name: course?.name || "Round",
        }}
        holes={holes}
        players={players}
      />

      <div className="rounded-xl border border-gray-100 bg-white p-4">
        <h2 className="text-sm font-bold text-gray-900 mb-2">Comments</h2>
        <RoundComments
          roundId={round.id}
          currentUserId={effectiveUserId}
          isAdmin={isAdmin}
        />
      </div>
    </div>
  );
}
