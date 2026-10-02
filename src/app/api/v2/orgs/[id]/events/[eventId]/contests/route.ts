import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin, isOrgMember } from "@/lib/v2/orgs";
import { CONTEST_SELECT, CONTEST_TYPES, createContest, type ContestType } from "@/lib/v2/contests";

/**
 * Event contests (#209, Phase 2a). GET lists an event's contests (any member);
 * POST creates one (org admins). Contests are authored here; the calendar derives
 * an entry from `contest_date`.
 */

export async function GET(request: Request, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: orgId, eventId } = await params;

  const admin = v2AdminClient();
  if (!(await isOrgMember(admin, userId, orgId))) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const url = new URL(request.url);
  let q = admin.from("v2_contests").select(CONTEST_SELECT).eq("org_id", orgId).eq("event_id", eventId);
  const parentId = url.searchParams.get("parentId");
  if (parentId === "null") q = q.is("parent_contest_id", null);
  else if (parentId) q = q.eq("parent_contest_id", parentId);
  const type = url.searchParams.get("type");
  if (type) q = q.eq("contest_type", type);

  const { data, error } = await q.order("contest_date", { nullsFirst: true }).order("sort_order");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contests: data || [] });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: orgId, eventId } = await params;

  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const contestType = body.contest_type as string;
  if (!CONTEST_TYPES.includes(contestType as ContestType)) {
    return NextResponse.json({ error: "Invalid contest_type" }, { status: 400 });
  }

  // Singleton side games: only one Skins per scramble (CTP/LD/LP may repeat).
  const parentId = (body.parent_contest_id as string) ?? null;
  if (parentId && contestType === "skins") {
    const { data: dupe } = await admin
      .from("v2_contests").select("id").eq("parent_contest_id", parentId).eq("contest_type", "skins").maybeSingle();
    if (dupe) return NextResponse.json({ error: "This scramble already has a Skins game." }, { status: 409 });
  }

  const contestDate = typeof body.contest_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.contest_date)
    ? body.contest_date : null;
  const startTime = typeof body.start_time === "string" && /^\d{2}:\d{2}/.test(body.start_time)
    ? body.start_time.slice(0, 5) : null;

  const result = await createContest(admin, {
    orgId,
    eventId,
    contestType: contestType as ContestType,
    name: typeof body.name === "string" ? body.name : undefined,
    parentContestId: (body.parent_contest_id as string) ?? null,
    contestDate,
    startTime,
    holes: Array.isArray(body.holes) ? (body.holes as number[]) : null,
    config: (body.config as Record<string, unknown>) ?? null,
    entryAmountCents: typeof body.entry_amount_cents === "number" ? body.entry_amount_cents : null,
    autoEnroll: typeof body.auto_enroll === "boolean" ? body.auto_enroll : undefined,
    createdBy: userId,
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ contest: result.contest });
}
