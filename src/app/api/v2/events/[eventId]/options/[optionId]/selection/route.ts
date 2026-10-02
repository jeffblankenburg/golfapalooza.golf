import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgMember, isOrgAdmin } from "@/lib/v2/orgs";
import { v2Now } from "@/lib/v2/simulator";
import { loadResolvedFeatures } from "@/lib/v2/features-server";
import { isFeatureActive } from "@/lib/v2/features";
import { syncOptionContestEnrollment, cascadeDeselectDependents, loadOptionSettings, selectionsStillOpen } from "@/lib/v2/options";

type Params = Promise<{ eventId: string; optionId: string }>;

/**
 * A member's own selection of an opt-in option (#216/#218). POST selects (enrolling
 * them into the contests their selection funds); DELETE deselects (and cascades to any
 * options that depend on this one). Members act on themselves; membership-gated and
 * blocked once options are closed / past the deadline (admins may still edit).
 */
async function resolve(request: Request, eventId: string, optionId: string) {
  const { userId } = await v2GetUser(request);
  if (!userId) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const admin = v2AdminClient();
  const { data: event } = await admin.from("v2_events").select("id, org_id").eq("id", eventId).maybeSingle();
  if (!event) return { error: NextResponse.json({ error: "Event not found" }, { status: 404 }) };
  const orgId = event.org_id as string;
  if (!(await isOrgMember(admin, userId, orgId))) {
    return { error: NextResponse.json({ error: "Not a member" }, { status: 403 }) };
  }
  const { data: option } = await admin.from("v2_options").select("id").eq("id", optionId).eq("event_id", eventId).maybeSingle();
  if (!option) return { error: NextResponse.json({ error: "Option not found" }, { status: 404 }) };

  // Editable while the Options feature's window is active AND the close cutoff
  // hasn't passed. Admins bypass both.
  if (!(await isOrgAdmin(admin, userId, orgId))) {
    const now = await v2Now();
    const [resolved, settings] = await Promise.all([
      loadResolvedFeatures(admin, orgId, eventId),
      loadOptionSettings(admin, eventId),
    ]);
    const feat = resolved.find((r) => r.def.key === "options") || null;
    if (!feat || !isFeatureActive(feat, false, now) || !selectionsStillOpen(settings, now.getTime())) {
      return { error: NextResponse.json({ error: "Options are closed" }, { status: 403 }) };
    }
  }
  return { admin, userId };
}

export async function POST(request: Request, { params }: { params: Params }) {
  const { eventId, optionId } = await params;
  const g = await resolve(request, eventId, optionId);
  if ("error" in g) return g.error;

  // Type-specific value: true (checkbox) | "choice" (select) | ["a","b"] (multi) |
  // {choice: qty} (quantity) | "text" | number. Defaults to true.
  let value: unknown = true;
  try {
    const body = (await request.json()) as { value?: unknown };
    if (body && body.value !== undefined) value = body.value;
  } catch {
    /* no body → presence (true) */
  }

  const { error } = await g.admin
    .from("v2_user_option_selections")
    .upsert({ event_id: eventId, option_id: optionId, user_id: g.userId, value }, { onConflict: "option_id,user_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await syncOptionContestEnrollment(g.admin, optionId, g.userId, value);
  return NextResponse.json({ selected: true, value });
}

export async function DELETE(request: Request, { params }: { params: Params }) {
  const { eventId, optionId } = await params;
  const g = await resolve(request, eventId, optionId);
  if ("error" in g) return g.error;

  const { error } = await g.admin
    .from("v2_user_option_selections")
    .delete().eq("option_id", optionId).eq("user_id", g.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await syncOptionContestEnrollment(g.admin, optionId, g.userId, null);
  await cascadeDeselectDependents(g.admin, eventId, g.userId, optionId);
  return NextResponse.json({ selected: false });
}
