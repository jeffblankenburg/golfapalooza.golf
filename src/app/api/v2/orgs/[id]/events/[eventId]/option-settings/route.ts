import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin, isOrgMember } from "@/lib/v2/orgs";
import { loadOptionSettings } from "@/lib/v2/options";

type Params = Promise<{ id: string; eventId: string }>;

/**
 * Per-event option settings (#218) — just the Options-specific read-only close date.
 * Visibility, open date, and the "it's open" notification live in the Features
 * registry now (/features), not here.
 */
export async function GET(request: Request, { params }: { params: Params }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: orgId, eventId } = await params;
  const admin = v2AdminClient();
  if (!(await isOrgMember(admin, userId, orgId))) return NextResponse.json({ error: "Not a member" }, { status: 403 });
  return NextResponse.json({ settings: await loadOptionSettings(admin, eventId) });
}

export async function PUT(request: Request, { params }: { params: Params }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: orgId, eventId } = await params;
  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  let body: { selection_deadline?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const patch: Record<string, unknown> = { event_id: eventId, updated_at: new Date().toISOString() };
  if ("selection_deadline" in body) patch.selection_deadline = body.selection_deadline || null;

  const { error } = await admin.from("v2_event_option_settings").upsert(patch, { onConflict: "event_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: await loadOptionSettings(admin, eventId) });
}
