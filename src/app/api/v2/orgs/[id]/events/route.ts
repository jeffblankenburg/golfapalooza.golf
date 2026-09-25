import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";
import { ensureEventRoom } from "@/lib/v2/chat/channels";

/**
 * Events for an org. GET lists (members); POST creates (admins).
 * Only one event may be `active` at a time — activating one archives any other
 * active event in the org (a group runs one event at a time).
 * Auth: bearer (native) or cookie (web).
 */

async function guard(request: Request, orgId: string, needAdmin: boolean) {
  const { userId } = await v2GetUser(request);
  if (!userId) return { error: "Not authenticated", status: 401 as const };
  const admin = v2AdminClient();
  if (needAdmin && !(await isOrgAdmin(admin, userId, orgId))) {
    return { error: "Not allowed", status: 403 as const };
  }
  return { admin, userId };
}

const STATUSES = ["draft", "active", "archived"];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const g = await guard(request, id, false);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const { data } = await g.admin
    .from("v2_events")
    .select("id, name, year, start_date, end_date, status, location")
    .eq("org_id", id)
    .order("year", { ascending: false })
    .order("start_date", { ascending: false });
  return NextResponse.json({ events: data || [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const g = await guard(request, id, true);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  let body: {
    name?: string;
    year?: number | null;
    start_date?: string | null;
    end_date?: string | null;
    status?: string;
    location?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const name = (body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Event name is required" }, { status: 400 });
  const status = STATUSES.includes(body.status || "") ? body.status! : "draft";

  if (status === "active") {
    await g.admin
      .from("v2_events")
      .update({ status: "archived" })
      .eq("org_id", id)
      .eq("status", "active");
  }

  const { data, error } = await g.admin
    .from("v2_events")
    .insert({
      org_id: id,
      name,
      year: body.year ?? null,
      start_date: body.start_date || null,
      end_date: body.end_date || null,
      status,
      location: body.location?.trim() || null,
      created_by: g.userId,
    })
    .select("id, name, year, start_date, end_date, status, location")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Every event gets a managed chat channel; members join it by RSVPing "Attending".
  await ensureEventRoom(g.admin, id, data.id, data.name).catch(() => {});

  return NextResponse.json({ event: data });
}
