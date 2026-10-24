import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";
import { setTournamentField, generateStructure, setGameResult, type FieldTeamInput } from "@/lib/v2/contests/tournament-server";

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

  const { data: t } = await admin.from("v2_tournaments").select("id, org_id").eq("id", tournamentId).eq("org_id", orgId).maybeSingle();
  if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: { action?: string; teams?: FieldTeamInput[]; gameId?: string; winnerTeamId?: string; scoreA?: number | null; scoreB?: number | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  try {
    if (body.action === "set_field") {
      await setTournamentField(admin, tournamentId, body.teams ?? []);
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
