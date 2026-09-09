import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgMember } from "@/lib/v2/orgs";

/**
 * The caller's notifications for one org.
 *   GET    ?orgId=  — recent notifications + unread count (chat types excluded,
 *                     matching the legacy drawer; chat surfaces its own).
 *   PATCH  { orgId, ids?[] | markAll } — mark read.
 *   DELETE { orgId, ids?[] | all }     — delete.
 * Auth: bearer (native) or cookie (web). A user only ever touches their OWN rows.
 */

const CHAT_TYPES = ["chat_message", "chat_mention"];

async function auth(request: Request, orgId: string | null) {
  const { userId } = await v2GetUser(request);
  if (!userId) return { error: "Not authenticated", status: 401 as const };
  if (!orgId) return { error: "orgId required", status: 400 as const };
  const admin = v2AdminClient();
  if (!(await isOrgMember(admin, userId, orgId))) {
    return { error: "Not a member", status: 403 as const };
  }
  return { admin, userId };
}

export async function GET(request: Request) {
  const orgId = new URL(request.url).searchParams.get("orgId");
  const a = await auth(request, orgId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  const [listRes, countRes] = await Promise.all([
    a.admin
      .from("v2_notifications")
      .select("id, type, title, body, data, read, created_at")
      .eq("user_id", a.userId)
      .eq("org_id", orgId)
      .not("type", "in", `(${CHAT_TYPES.join(",")})`)
      .order("created_at", { ascending: false })
      .limit(40),
    a.admin
      .from("v2_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", a.userId)
      .eq("org_id", orgId)
      .eq("read", false)
      .not("type", "in", `(${CHAT_TYPES.join(",")})`),
  ]);

  return NextResponse.json({
    notifications: listRes.data || [],
    unread: countRes.count ?? 0,
  });
}

export async function PATCH(request: Request) {
  let body: { orgId?: string; ids?: string[]; markAll?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const a = await auth(request, body.orgId ?? null);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  let q = a.admin
    .from("v2_notifications")
    .update({ read: true })
    .eq("user_id", a.userId)
    .eq("org_id", body.orgId!);
  if (!body.markAll) {
    if (!body.ids?.length) return NextResponse.json({ error: "ids required" }, { status: 400 });
    q = q.in("id", body.ids);
  }
  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  let body: { orgId?: string; ids?: string[]; all?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const a = await auth(request, body.orgId ?? null);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  let q = a.admin
    .from("v2_notifications")
    .delete()
    .eq("user_id", a.userId)
    .eq("org_id", body.orgId!);
  if (!body.all) {
    if (!body.ids?.length) return NextResponse.json({ error: "ids required" }, { status: 400 });
    q = q.in("id", body.ids);
  }
  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
