import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin, isOrgMember } from "@/lib/v2/orgs";
import { normalizeScheduleItem } from "@/lib/v2/schedule";

/**
 * Event schedule items (#208). GET is readable by any org member; POST creates a
 * new item (org admins only). Items belong to an event and are grouped by `day`
 * in the per-day agenda.
 */

const SELECT = "id, event_id, title, description, location, day, end_day, start_time, end_time, all_day, sort_order, kind, activity_type, activity_id";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: orgId, eventId } = await params;

  const admin = v2AdminClient();
  if (!(await isOrgMember(admin, userId, orgId))) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const { data, error } = await admin
    .from("v2_schedule_items")
    .select(SELECT)
    .eq("event_id", eventId)
    .order("day", { ascending: true })
    .order("all_day", { ascending: false })
    .order("start_time", { ascending: true, nullsFirst: true })
    .order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data || [] });
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
  // Require the essentials on create.
  const norm = normalizeScheduleItem({ kind: "general", ...body });
  if ("error" in norm) return NextResponse.json(norm, { status: 400 });
  if (!norm.title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (!norm.day) return NextResponse.json({ error: "A valid day is required" }, { status: 400 });

  const { data, error } = await admin
    .from("v2_schedule_items")
    .insert({ ...norm, event_id: eventId, org_id: orgId, created_by: userId })
    .select(SELECT)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
