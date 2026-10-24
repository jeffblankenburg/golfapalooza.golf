import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";
import { createTournament } from "@/lib/v2/contests/tournament-server";

type Params = Promise<{ id: string }>;

/** Shared tournaments for an org (#226). GET lists them; POST creates one (admin). */
export async function GET(request: Request, { params }: { params: Params }) {
  const { id: orgId } = await params;
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const { data } = await admin.from("v2_tournaments").select("id, name, sport, season, status, source").eq("org_id", orgId).order("created_at", { ascending: false });
  return NextResponse.json({ tournaments: data ?? [] });
}

export async function POST(request: Request, { params }: { params: Params }) {
  const { id: orgId } = await params;
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  let body: { name?: string; sport?: string; season?: string | null; source?: "manual" | "espn" };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  const name = (body.name || "").trim();
  const sport = (body.sport || "").trim();
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
  if (!sport) return NextResponse.json({ error: "Sport required" }, { status: 400 });
  try {
    const { id } = await createTournament(admin, { orgId, name, sport, season: body.season ?? null, source: body.source ?? "manual", createdBy: userId });
    return NextResponse.json({ id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Create failed" }, { status: 500 });
  }
}
