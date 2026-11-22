import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";
import { normalizeRoom, ROOM_SELECT } from "@/lib/v2/lodging";

/** Create a room within a property. Admins only. Expects `property_id` in the body. */
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
  const propertyId = typeof body.property_id === "string" ? body.property_id : null;
  if (!propertyId) return NextResponse.json({ error: "property_id is required" }, { status: 400 });

  // Confirm the property belongs to this org+event before attaching a room to it.
  const { data: prop } = await admin
    .from("v2_lodging_properties")
    .select("id")
    .eq("id", propertyId)
    .eq("org_id", orgId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!prop) return NextResponse.json({ error: "Unknown property" }, { status: 404 });

  const norm = normalizeRoom(body);
  if ("error" in norm) return NextResponse.json(norm, { status: 400 });

  const { data, error } = await admin
    .from("v2_lodging_rooms")
    .insert({ ...norm, property_id: propertyId, org_id: orgId, event_id: eventId })
    .select(ROOM_SELECT)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ room: data });
}
