import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin, isOrgMember } from "@/lib/v2/orgs";
import { CONTEST_SELECT, setContestBuyIn, deleteContestCostItems, type Contest } from "@/lib/v2/contests";
import { enrollRosterIntoContest } from "@/lib/v2/contests/enrollment";

/** A single event contest (#209). GET any member; PATCH/DELETE org admins. */

export async function GET(request: Request, { params }: { params: Promise<{ id: string; eventId: string; contestId: string }> }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: orgId, eventId, contestId } = await params;

  const admin = v2AdminClient();
  if (!(await isOrgMember(admin, userId, orgId))) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const { data, error } = await admin
    .from("v2_contests").select(CONTEST_SELECT)
    .eq("id", contestId).eq("org_id", orgId).eq("event_id", eventId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ contest: data });
}

// Fields an admin may edit directly (scoring_source is set by type on create).
// entry_amount_cents is NOT a column — the buy-in lives in v2_cost_items and is
// handled separately below via setContestBuyIn (single source of truth, #213).
const EDITABLE = new Set([
  "name", "contest_date", "start_time", "course_id", "tee_id", "holes", "config", "payout_splits",
  "auto_enroll", "declared_no_winner", "status", "sort_order", "winners_locked_at", "winners_locked_by",
]);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; eventId: string; contestId: string }> }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: orgId, eventId, contestId } = await params;

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

  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (EDITABLE.has(k)) patch[k] = v;
  // The buy-in is stored in v2_cost_items, not on the contest — pull it aside.
  const hasBuyIn = "entry_amount_cents" in body;
  const buyInCents = hasBuyIn ? (typeof body.entry_amount_cents === "number" ? (body.entry_amount_cents as number) : null) : undefined;
  if (Object.keys(patch).length === 0 && !hasBuyIn) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  if ("name" in patch) {
    const name = String(patch.name || "").trim();
    if (!name) return NextResponse.json({ error: "Name can't be empty" }, { status: 400 });
    patch.name = name;
  }

  // Apply column edits (if any); otherwise just load the row to sync its buy-in.
  let contest: Contest;
  if (Object.keys(patch).length > 0) {
    patch.updated_at = new Date().toISOString();
    const { data, error } = await admin
      .from("v2_contests").update(patch)
      .eq("id", contestId).eq("org_id", orgId).eq("event_id", eventId)
      .select(CONTEST_SELECT).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    contest = data as Contest;
  } else {
    const { data, error } = await admin
      .from("v2_contests").select(CONTEST_SELECT)
      .eq("id", contestId).eq("org_id", orgId).eq("event_id", eventId).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    contest = data as Contest;
  }

  // Sync the buy-in cost item: set the amount when the buy-in changed, otherwise
  // (undefined) just carry the new display name onto any existing row.
  await setContestBuyIn(admin, contest, hasBuyIn ? buyInCents : undefined);

  // Turning on auto-enroll (making it an Included contest) pulls in everyone
  // currently on-roster (#215), minus explicit opt-outs. Idempotent; best-effort.
  if (patch.auto_enroll === true) {
    await enrollRosterIntoContest(admin, contestId, eventId).catch(() => {});
  }
  return NextResponse.json({ contest });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; eventId: string; contestId: string }> }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: orgId, eventId, contestId } = await params;

  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  // Un-link any schedule item pointing at this contest (activity_id has no FK).
  await admin.from("v2_schedule_items").update({ activity_id: null }).eq("activity_id", contestId);
  // Projected buy-in cost items (contest + its children) have no FK — clean up first.
  await deleteContestCostItems(admin, contestId);
  // Child contests + teams/scores/winners/observations cascade via FK.
  const { error } = await admin.from("v2_contests").delete().eq("id", contestId).eq("org_id", orgId).eq("event_id", eventId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
