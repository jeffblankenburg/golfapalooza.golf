import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";
import { normalizeProperty, PROPERTY_SELECT, IMAGE_SELECT } from "@/lib/v2/lodging";

/** Update (PATCH) or delete (DELETE) a single lodging property. Admins only. */

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; eventId: string; propertyId: string }> }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: orgId, eventId, propertyId } = await params;

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
  const norm = normalizeProperty(body, { partial: true });
  if ("error" in norm) return NextResponse.json(norm, { status: 400 });

  const { data, error } = await admin
    .from("v2_lodging_properties")
    .update({ ...norm, updated_at: new Date().toISOString() })
    .eq("id", propertyId)
    .eq("org_id", orgId)
    .eq("event_id", eventId)
    .select(`${PROPERTY_SELECT}, images:v2_lodging_property_images(${IMAGE_SELECT})`)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ property: data });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; eventId: string; propertyId: string }> }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: orgId, propertyId } = await params;

  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  // Rooms, images, and assignments cascade via FK ON DELETE CASCADE.
  const { error } = await admin.from("v2_lodging_properties").delete().eq("id", propertyId).eq("org_id", orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
