import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgMember, isOrgAdmin } from "@/lib/v2/orgs";
import {
  addContestParticipants,
  removeContestParticipants,
  enrollRosterIntoContest,
} from "@/lib/v2/contests/enrollment";

type Params = Promise<{ id: string; eventId: string; contestId: string }>;

/** A contest's participants with display info (#209). Any org member may read. */
export async function GET(request: Request, { params }: { params: Params }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: orgId, contestId } = await params;

  const admin = v2AdminClient();
  if (!(await isOrgMember(admin, userId, orgId))) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const { data, error } = await admin
    .from("v2_contest_participants")
    .select("user_id, v2_profiles!inner(id, display_name, first_name, last_name, avatar_url)")
    .eq("contest_id", contestId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const participants = (data || []).map((r) => {
    const p = (r as { v2_profiles: unknown }).v2_profiles as {
      id: string; display_name: string | null; first_name: string | null; last_name: string | null; avatar_url: string | null;
    };
    return { user_id: p.id, display_name: p.display_name, first_name: p.first_name, last_name: p.last_name, avatar_url: p.avatar_url };
  });
  return NextResponse.json({ participants });
}

/**
 * Add participants to a contest (#215). Owner/admin only.
 *   { importAll: true }      → enroll every on-roster member (minus tombstones)
 *   { userIds: [...] }       → add specific members (any active org member, even
 *                              non-attendees — the local drop-in). Clears their opt-out.
 * Participation is independent of attendance; nothing is blocked.
 */
export async function POST(request: Request, { params }: { params: Params }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: orgId, eventId, contestId } = await params;

  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  let body: { userIds?: string[]; importAll?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Guard the contest belongs to this org/event.
  const { data: contest } = await admin
    .from("v2_contests").select("id").eq("id", contestId).eq("org_id", orgId).eq("event_id", eventId).maybeSingle();
  if (!contest) return NextResponse.json({ error: "Contest not found" }, { status: 404 });

  try {
    if (body.importAll) {
      const added = await enrollRosterIntoContest(admin, contestId, eventId);
      return NextResponse.json({ ok: true, added });
    }

    const requested = [...new Set(body.userIds || [])].filter(Boolean);
    if (requested.length === 0) return NextResponse.json({ error: "No members given" }, { status: 400 });

    // Only active members of THIS org may be added (prevents adding strangers).
    const { data: members } = await admin
      .from("v2_memberships")
      .select("user_id")
      .eq("org_id", orgId)
      .eq("status", "active")
      .is("archived_at", null)
      .in("user_id", requested);
    const valid = (members || []).map((m) => m.user_id as string);
    if (valid.length === 0) return NextResponse.json({ error: "No valid members" }, { status: 400 });

    const added = await addContestParticipants(admin, contestId, valid);
    return NextResponse.json({ ok: true, added, skipped: requested.length - valid.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

/**
 * Remove participants from a contest (#215). Owner/admin only. Writes an opt-out
 * tombstone so attendance-sync won't re-add them. Never blocked — surfacing broken
 * team seats is #217.
 *   { userIds: [...], reason? }
 */
export async function DELETE(request: Request, { params }: { params: Params }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: orgId, eventId, contestId } = await params;

  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  let body: { userIds?: string[]; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const userIds = [...new Set(body.userIds || [])].filter(Boolean);
  if (userIds.length === 0) return NextResponse.json({ error: "No members given" }, { status: 400 });

  const { data: contest } = await admin
    .from("v2_contests").select("id").eq("id", contestId).eq("org_id", orgId).eq("event_id", eventId).maybeSingle();
  if (!contest) return NextResponse.json({ error: "Contest not found" }, { status: 404 });

  try {
    const removed = await removeContestParticipants(admin, contestId, userIds, userId, body.reason ?? null);
    return NextResponse.json({ ok: true, removed });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
