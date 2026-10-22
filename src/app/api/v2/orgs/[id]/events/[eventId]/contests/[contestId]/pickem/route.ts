import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";
import { listGames, addGame, addEspnGames, patchGame, deleteGame, refreshGameLine, gradePickemFinals, type PickemResult } from "@/lib/v2/contests/pickem-server";

type Params = Promise<{ id: string; eventId: string; contestId: string }>;

/** Admin Pick'em game slate (#209). Build the games, flag a tiebreaker, enter
 *  results. Thin shell over the shared Pick'em engine — see `pickem-server.ts`. */
async function gate(request: Request, orgId: string, contestId: string) {
  const { userId } = await v2GetUser(request);
  if (!userId) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) return { error: NextResponse.json({ error: "Admins only" }, { status: 403 }) };
  const { data: contest } = await admin.from("v2_contests").select("id, contest_type").eq("id", contestId).eq("org_id", orgId).maybeSingle();
  if (!contest || contest.contest_type !== "pickem") return { error: NextResponse.json({ error: "Not a Pick'em contest" }, { status: 404 }) };
  return { admin, userId };
}

function respond<T>(r: PickemResult<T>, key: string) {
  return r.ok ? NextResponse.json({ [key]: r.data }) : NextResponse.json({ error: r.error }, { status: r.status });
}

export async function GET(request: Request, { params }: { params: Params }) {
  const { id: orgId, contestId } = await params;
  const g = await gate(request, orgId, contestId);
  if ("error" in g) return g.error;
  return NextResponse.json({ games: await listGames(g.admin, contestId) });
}

export async function POST(request: Request, { params }: { params: Params }) {
  const { id: orgId, contestId } = await params;
  const g = await gate(request, orgId, contestId);
  if ("error" in g) return g.error;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  if (body?.gradeNow) return NextResponse.json(await gradePickemFinals(g.admin, { contestId }));
  if (Array.isArray(body?.espnGames)) {
    const r = await addEspnGames(g.admin, contestId, body.espnGames);
    return r.ok ? NextResponse.json({ added: r.data }) : NextResponse.json({ error: r.error }, { status: r.status });
  }
  return respond(await addGame(g.admin, contestId, body), "game");
}

export async function PATCH(request: Request, { params }: { params: Params }) {
  const { id: orgId, contestId } = await params;
  const g = await gate(request, orgId, contestId);
  if ("error" in g) return g.error;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  if (body?.refreshLine && body.gameId) return respond(await refreshGameLine(g.admin, contestId, body.gameId), "game");
  return respond(await patchGame(g.admin, contestId, body), "game");
}

export async function DELETE(request: Request, { params }: { params: Params }) {
  const { id: orgId, contestId } = await params;
  const g = await gate(request, orgId, contestId);
  if ("error" in g) return g.error;
  const gameId = new URL(request.url).searchParams.get("gameId");
  const r = await deleteGame(g.admin, contestId, gameId);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}
