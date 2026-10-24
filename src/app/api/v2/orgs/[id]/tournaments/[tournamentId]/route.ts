import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";
import { loadTournamentSource } from "@/lib/v2/contests/tournament-server";

type Params = Promise<{ id: string; tournamentId: string }>;

async function gate(request: Request, orgId: string) {
  const { userId } = await v2GetUser(request);
  if (!userId) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) return { error: NextResponse.json({ error: "Admins only" }, { status: 403 }) };
  return { admin, userId };
}

/** One tournament: GET the full source (field + bracket), DELETE it. */
export async function GET(request: Request, { params }: { params: Params }) {
  const { id: orgId, tournamentId } = await params;
  const g = await gate(request, orgId);
  if ("error" in g) return g.error;
  const src = await loadTournamentSource(g.admin, tournamentId);
  if (!src || src.tournament.org_id !== orgId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    tournament: src.tournament, teams: src.teams, games: src.games,
    champion: src.champion(), runnerUp: src.runnerUp(),
  });
}

export async function DELETE(request: Request, { params }: { params: Params }) {
  const { id: orgId, tournamentId } = await params;
  const g = await gate(request, orgId);
  if ("error" in g) return g.error;
  const { error } = await g.admin.from("v2_tournaments").delete().eq("id", tournamentId).eq("org_id", orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
