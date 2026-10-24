import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";
import { setTournamentField, generateStructure, setGameResult, type FieldTeamInput } from "@/lib/v2/contests/tournament-server";
import { fetchBracketField } from "@/lib/v2/sports/espn-tournament";

type Params = Promise<{ id: string; tournamentId: string }>;

/**
 * Tournament management actions (admin):
 *   { action:"set_field", teams:[...] }   — replace the seeded field (pre-generate).
 *   { action:"generate" }                 — build the single-elim structure + lock.
 *   { action:"set_result", gameId, winnerTeamId, scoreA?, scoreB? } — record + advance.
 */
export async function POST(request: Request, { params }: { params: Params }) {
  const { id: orgId, tournamentId } = await params;
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const { data: t } = await admin.from("v2_tournaments").select("id, org_id, sport").eq("id", tournamentId).eq("org_id", orgId).maybeSingle();
  if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: { action?: string; teams?: FieldTeamInput[]; dates?: string[]; gameId?: string; winnerTeamId?: string; scoreA?: number | null; scoreB?: number | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  try {
    // Re-wire a generated bracket after the field changes — otherwise replacing the
    // teams (delete + re-insert) would null the games' team FKs (ON DELETE SET NULL).
    const resyncBracket = async () => {
      const { count } = await admin.from("v2_tournament_games").select("id", { count: "exact", head: true }).eq("tournament_id", tournamentId);
      if (count && count > 0) await generateStructure(admin, tournamentId);
    };

    if (body.action === "import_espn") {
      const dates = (body.dates ?? []).filter((d) => /^\d{8}$/.test(d));
      if (!dates.length) return NextResponse.json({ error: "Round-1 date(s) required (YYYYMMDD)" }, { status: 400 });
      const field = await fetchBracketField(t.sport as string, dates);
      if (!field.length) return NextResponse.json({ error: "ESPN returned no Round-1 teams for those dates. Check the dates." }, { status: 422 });
      await setTournamentField(admin, tournamentId, field);
      await resyncBracket();
      return NextResponse.json({ ok: true, imported: field.length });
    }
    if (body.action === "set_field") {
      await setTournamentField(admin, tournamentId, body.teams ?? []);
      await resyncBracket();
      return NextResponse.json({ ok: true });
    }
    if (body.action === "generate") {
      const r = await generateStructure(admin, tournamentId);
      return NextResponse.json({ ok: true, ...r });
    }
    if (body.action === "set_result") {
      if (!body.gameId || !body.winnerTeamId) return NextResponse.json({ error: "gameId + winnerTeamId required" }, { status: 400 });
      await setGameResult(admin, tournamentId, body.gameId, { winnerTeamId: body.winnerTeamId, scoreA: body.scoreA ?? null, scoreB: body.scoreB ?? null });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Action failed" }, { status: 500 });
  }
}
