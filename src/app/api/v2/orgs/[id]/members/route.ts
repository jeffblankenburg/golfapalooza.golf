import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";
import type { SupabaseClient } from "@supabase/supabase-js";

async function guard(request: Request, orgId: string) {
  const { userId } = await v2GetUser(request);
  if (!userId) return { error: "Not authenticated", status: 401 as const };
  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) {
    return { error: "Not allowed", status: 403 as const };
  }
  return { admin, userId };
}

async function roleOf(admin: SupabaseClient, orgId: string, userId: string): Promise<string | null> {
  const { data } = await admin
    .from("v2_memberships")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  return data?.role ?? null;
}

async function ownerCount(admin: SupabaseClient, orgId: string): Promise<number> {
  const { count } = await admin
    .from("v2_memberships")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("role", "owner")
    .eq("status", "active");
  return count ?? 0;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const g = await guard(request, id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const { data } = await g.admin
    .from("v2_memberships")
    .select("user_id, role, status, profile:v2_profiles(display_name, avatar_url)")
    .eq("org_id", id)
    .order("role");
  const members = (data || []).map((m) => {
    const p = Array.isArray(m.profile) ? m.profile[0] : m.profile;
    return {
      user_id: m.user_id,
      role: m.role,
      status: m.status,
      display_name: (p as { display_name?: string })?.display_name || "Member",
      avatar_url: (p as { avatar_url?: string | null })?.avatar_url || null,
    };
  });
  return NextResponse.json({ members });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const g = await guard(request, id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  let body: { user_id?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { user_id, role } = body;
  if (!user_id || !role || !["owner", "admin", "member"].includes(role)) {
    return NextResponse.json({ error: "user_id and a valid role are required" }, { status: 400 });
  }

  const callerRole = await roleOf(g.admin, id, g.userId);
  const targetRole = await roleOf(g.admin, id, user_id);
  if (!targetRole) return NextResponse.json({ error: "Not a member" }, { status: 404 });

  // Only an owner may grant owner, or change a current owner's role.
  if ((role === "owner" || targetRole === "owner") && callerRole !== "owner") {
    return NextResponse.json({ error: "Only an owner can manage owners" }, { status: 403 });
  }
  // Never demote the last owner.
  if (targetRole === "owner" && role !== "owner" && (await ownerCount(g.admin, id)) <= 1) {
    return NextResponse.json({ error: "The group must keep at least one owner" }, { status: 400 });
  }

  const { error } = await g.admin
    .from("v2_memberships")
    .update({ role })
    .eq("org_id", id)
    .eq("user_id", user_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const g = await guard(request, id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  let body: { user_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!body.user_id) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  const callerRole = await roleOf(g.admin, id, g.userId);
  const targetRole = await roleOf(g.admin, id, body.user_id);
  if (!targetRole) return NextResponse.json({ error: "Not a member" }, { status: 404 });

  if (targetRole === "owner" && callerRole !== "owner") {
    return NextResponse.json({ error: "Only an owner can remove an owner" }, { status: 403 });
  }
  if (targetRole === "owner" && (await ownerCount(g.admin, id)) <= 1) {
    return NextResponse.json({ error: "The group must keep at least one owner" }, { status: 400 });
  }

  const { error } = await g.admin
    .from("v2_memberships")
    .delete()
    .eq("org_id", id)
    .eq("user_id", body.user_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
