import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";
import { normalizeProperty, PROPERTY_SELECT } from "@/lib/v2/lodging";

/**
 * Lodging properties for an event. POST creates a property (admins only). The admin
 * and member pages load the full lodging tree server-side via the admin client, so
 * there's no GET here — this collection endpoint is create-only.
 */
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
  const norm = normalizeProperty(body);
  if ("error" in norm) return NextResponse.json(norm, { status: 400 });

  const { data, error } = await admin
    .from("v2_lodging_properties")
    .insert({ ...norm, org_id: orgId, event_id: eventId, created_by: userId })
    .select(PROPERTY_SELECT)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ property: { ...data, images: [] } });
}
