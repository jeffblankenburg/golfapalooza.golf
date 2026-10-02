import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin, isOrgMember } from "@/lib/v2/orgs";
import { OPTION_GROUP_SELECT, type OptionGroup } from "@/lib/v2/options";

type Params = Promise<{ id: string; eventId: string }>;

/** Option groups (#218) — sections that organize options. Members read; admins write. */
export async function GET(request: Request, { params }: { params: Params }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: orgId, eventId } = await params;
  const admin = v2AdminClient();
  if (!(await isOrgMember(admin, userId, orgId))) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const { data } = await admin.from("v2_option_groups").select(OPTION_GROUP_SELECT).eq("event_id", eventId).order("sort_order");
  return NextResponse.json({ groups: (data || []) as OptionGroup[] });
}

export async function POST(request: Request, { params }: { params: Params }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: orgId, eventId } = await params;
  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  let body: { name?: string; description?: string; icon?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const name = (body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (name.length > 100) return NextResponse.json({ error: "Name is too long" }, { status: 400 });

  const { data: last } = await admin.from("v2_option_groups").select("sort_order").eq("event_id", eventId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const sort_order = (last?.sort_order ?? -1) + 1;

  const { data, error } = await admin
    .from("v2_option_groups")
    .insert({ org_id: orgId, event_id: eventId, name, description: (body.description || "").trim() || null, icon: (body.icon || "").trim() || null, sort_order, created_by: userId })
    .select(OPTION_GROUP_SELECT).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ group: data as OptionGroup });
}
