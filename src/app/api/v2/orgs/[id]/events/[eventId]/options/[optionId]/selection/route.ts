import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";
import {
  syncOptionContestEnrollment, cascadeDeselectDependents, optionValueIsEmpty, type OptionType,
} from "@/lib/v2/options";

type Params = Promise<{ id: string; eventId: string; optionId: string }>;

/**
 * Admin sets/clears an option selection for ANOTHER member (#239 — the selections
 * grid lets admins answer on a Loozer's behalf). Mirrors the member selection
 * endpoint's side effects exactly — contest enrollment sync on set, and
 * dependent-cascade on clear — so admin edits stay consistent. Owner/admin only;
 * no close-window gate (admins always edit).
 *
 * PUT { userId, value }  — an "empty" value (false/""/[]/null) clears the selection.
 */
export async function PUT(request: Request, { params }: { params: Params }) {
  const { id: orgId, eventId, optionId } = await params;
  const { userId: actorId } = await v2GetUser(request);
  if (!actorId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, actorId, orgId))) {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  let body: { userId?: string; value?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const targetId = body.userId;
  if (!targetId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  // The event must belong to this org, and the option to the event.
  const { data: event } = await admin.from("v2_events").select("org_id").eq("id", eventId).maybeSingle();
  if (!event || event.org_id !== orgId) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  const { data: option } = await admin
    .from("v2_options").select("id, option_type").eq("id", optionId).eq("event_id", eventId).maybeSingle();
  if (!option) return NextResponse.json({ error: "Option not found" }, { status: 404 });

  // The member must belong to the org.
  const { data: mem } = await admin.from("v2_memberships").select("user_id").eq("org_id", orgId).eq("user_id", targetId).maybeSingle();
  if (!mem) return NextResponse.json({ error: "Not a member of this group" }, { status: 400 });

  const type = (option.option_type as OptionType) || "checkbox";
  const value = body.value;

  if (optionValueIsEmpty(type, value)) {
    const { error } = await admin
      .from("v2_user_option_selections")
      .delete().eq("option_id", optionId).eq("user_id", targetId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await syncOptionContestEnrollment(admin, optionId, targetId, null);
    await cascadeDeselectDependents(admin, eventId, targetId, optionId);
    return NextResponse.json({ selected: false });
  }

  const { error } = await admin
    .from("v2_user_option_selections")
    .upsert({ event_id: eventId, option_id: optionId, user_id: targetId, value }, { onConflict: "option_id,user_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await syncOptionContestEnrollment(admin, optionId, targetId, value);
  return NextResponse.json({ selected: true, value });
}
