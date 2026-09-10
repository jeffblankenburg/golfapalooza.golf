import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgMember } from "@/lib/v2/orgs";
import { logActivity } from "@/lib/v2/activity";

/**
 * RSVP for an event. Mirrors the legacy model: a member sets their attendance
 * *likelihood* (25/50/75/99). 99 ("Attending") marks them on_roster. DELETE
 * clears the RSVP. Returns the caller's likelihood plus the attending count
 * (on_roster). Auth: bearer (native) or cookie (web). Membership-gated.
 *
 * NOTE: the legacy site also cascades contest/roster enrollment on attend/leave.
 * v2 has no contest system yet, so we only persist likelihood + on_roster here;
 * enrollment sync lands when v2 contests do.
 */

const LIKELIHOODS = [25, 50, 75, 99];
const LIKELIHOOD_LABEL: Record<number, string> = {
  99: "Attending",
  75: "Probable",
  50: "Questionable",
  25: "Doubtful",
};

async function resolve(request: Request, eventId: string) {
  const { userId } = await v2GetUser(request);
  if (!userId) return { error: "Not authenticated", status: 401 as const };
  const admin = v2AdminClient();
  const { data: event } = await admin
    .from("v2_events")
    .select("id, org_id")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) return { error: "Event not found", status: 404 as const };
  if (!(await isOrgMember(admin, userId, event.org_id))) {
    return { error: "Not a member", status: 403 as const };
  }
  return { admin, userId, orgId: event.org_id as string };
}

async function attendingCount(
  admin: ReturnType<typeof v2AdminClient>,
  eventId: string,
): Promise<number> {
  const { count } = await admin
    .from("v2_event_participants")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("on_roster", true);
  return count ?? 0;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const g = await resolve(request, eventId);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const { data } = await g.admin
    .from("v2_event_participants")
    .select("user_id, likelihood, likelihood_set_at, on_roster, user:v2_profiles(display_name, avatar_url)")
    .eq("event_id", eventId);

  const rows = (data || []).map((r) => {
    const u = Array.isArray(r.user) ? r.user[0] : r.user;
    return {
      userId: r.user_id as string,
      likelihood: r.likelihood as number,
      likelihoodSetAt: (r.likelihood_set_at as string | null) ?? null,
      displayName: (u?.display_name as string) || "Member",
      avatarUrl: (u?.avatar_url as string | null) ?? null,
    };
  });

  const mine = rows.find((r) => r.userId === g.userId);
  return NextResponse.json({
    likelihood: mine?.likelihood ?? null,
    attendingCount: (data || []).filter((r) => r.on_roster).length,
    responseCount: rows.length,
    participants: rows,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const g = await resolve(request, eventId);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  let body: { likelihood?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const likelihood = body.likelihood;
  if (!LIKELIHOODS.includes(likelihood as number)) {
    return NextResponse.json(
      { error: "likelihood must be 25, 50, 75, or 99" },
      { status: 400 },
    );
  }
  const onRoster = likelihood === 99;

  // Pre-read prior likelihood so we log only a *genuine change* (not a re-confirm
  // of the same level). Any move between levels is feed-worthy.
  const { data: prior } = await g.admin
    .from("v2_event_participants")
    .select("likelihood")
    .eq("event_id", eventId)
    .eq("user_id", g.userId)
    .maybeSingle();
  const priorLikelihood = (prior?.likelihood as number | undefined) ?? null;

  const { error } = await g.admin.from("v2_event_participants").upsert(
    {
      event_id: eventId,
      org_id: g.orgId,
      user_id: g.userId,
      likelihood,
      on_roster: onRoster,
      likelihood_set_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "event_id,user_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Activity feed: a row per genuine likelihood change. Title is the status only
  // ("Attending 99%") — the feed renders the actor's name + avatar itself.
  if (priorLikelihood !== likelihood) {
    await logActivity(g.admin, {
      orgId: g.orgId,
      eventId,
      kind: "rsvp",
      actorId: g.userId,
      title: `${LIKELIHOOD_LABEL[likelihood as number]} ${likelihood}%`,
      refId: eventId,
      metadata: { likelihood },
    }).catch(() => {});
  }

  return NextResponse.json({
    likelihood,
    attendingCount: await attendingCount(g.admin, eventId),
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const g = await resolve(request, eventId);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const { error } = await g.admin
    .from("v2_event_participants")
    .delete()
    .eq("event_id", eventId)
    .eq("user_id", g.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    likelihood: null,
    attendingCount: await attendingCount(g.admin, eventId),
  });
}
