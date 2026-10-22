import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";
import { loadContestRoster, addContestParticipants, removeContestParticipants } from "@/lib/v2/contests/enrollment";

type Params = Promise<{ id: string; contestId: string }>;

/**
 * A contest's participant picker — scope-agnostic (works for event- or group-
 * scoped contests; it reads the contest's `event_id` to decide the live source).
 * GET returns every eligible member (current roster / membership) with a
 * `participating` flag; POST/DELETE toggle membership in this contest. Admins only.
 */
async function gate(request: Request, orgId: string, contestId: string) {
  const { userId } = await v2GetUser(request);
  if (!userId) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) return { error: NextResponse.json({ error: "Admins only" }, { status: 403 }) };
  const { data: contest } = await admin
    .from("v2_contests").select("id, org_id, event_id").eq("id", contestId).eq("org_id", orgId).maybeSingle();
  if (!contest) return { error: NextResponse.json({ error: "Contest not found" }, { status: 404 }) };
  return { admin, userId, contest: contest as { id: string; org_id: string; event_id: string | null } };
}

export async function GET(request: Request, { params }: { params: Params }) {
  const { id: orgId, contestId } = await params;
  const g = await gate(request, orgId, contestId);
  if ("error" in g) return g.error;
  return NextResponse.json({ members: await loadContestRoster(g.admin, g.contest) });
}

export async function POST(request: Request, { params }: { params: Params }) {
  const { id: orgId, contestId } = await params;
  const g = await gate(request, orgId, contestId);
  if ("error" in g) return g.error;

  let body: { userIds?: string[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  const requested = [...new Set(body.userIds || [])].filter(Boolean);
  if (requested.length === 0) return NextResponse.json({ error: "No members given" }, { status: 400 });

  // Only active members of this org may be added.
  const { data: members } = await g.admin
    .from("v2_memberships").select("user_id").eq("org_id", orgId).eq("status", "active").is("archived_at", null).in("user_id", requested);
  const valid = (members || []).map((m) => m.user_id as string);
  if (valid.length === 0) return NextResponse.json({ error: "No valid members" }, { status: 400 });

  try {
    const added = await addContestParticipants(g.admin, contestId, valid);
    return NextResponse.json({ ok: true, added });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Params }) {
  const { id: orgId, contestId } = await params;
  const g = await gate(request, orgId, contestId);
  if ("error" in g) return g.error;

  let body: { userIds?: string[]; reason?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  const userIds = [...new Set(body.userIds || [])].filter(Boolean);
  if (userIds.length === 0) return NextResponse.json({ error: "No members given" }, { status: 400 });

  try {
    const removed = await removeContestParticipants(g.admin, contestId, userIds, g.userId, body.reason ?? null);
    return NextResponse.json({ ok: true, removed });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
