import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";
import { cleanProfileFields, displayNameFrom } from "@/lib/v2/profile";
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
    .select(
      "user_id, role, status, profile:v2_profiles(display_name, first_name, last_name, nickname, birthdate, avatar_url)",
    )
    .eq("org_id", id)
    .order("role");
  // Return the raw name parts so the client can sort/display per the org's
  // name-display mode (last-name vs nickname) and edit them in the modal.
  const members = (data || []).map((m) => {
    const p = (Array.isArray(m.profile) ? m.profile[0] : m.profile) as {
      display_name?: string | null;
      first_name?: string | null;
      last_name?: string | null;
      nickname?: string | null;
      birthdate?: string | null;
      avatar_url?: string | null;
    } | null;
    return {
      user_id: m.user_id,
      role: m.role,
      status: m.status,
      display_name: p?.display_name || "Member",
      first_name: p?.first_name ?? null,
      last_name: p?.last_name ?? null,
      nickname: p?.nickname ?? null,
      birthdate: p?.birthdate ?? null,
      avatar_url: p?.avatar_url || null,
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

  let body: {
    user_id?: string;
    role?: string;
    profile?: {
      first_name?: string | null;
      last_name?: string | null;
      nickname?: string | null;
      birthdate?: string | null;
    };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { user_id, role, profile } = body;
  if (!user_id) return NextResponse.json({ error: "user_id is required" }, { status: 400 });
  if (!role && !profile) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const targetRole = await roleOf(g.admin, id, user_id);
  if (!targetRole) return NextResponse.json({ error: "Not a member" }, { status: 404 });

  // Role change (guarded like before) — optional.
  if (role) {
    if (!["owner", "admin", "member"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    const callerRole = await roleOf(g.admin, id, g.userId);
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
  }

  // Profile edit (admins can edit any member's identity) — optional. Recompute
  // display_name (nickname-preferred) from the new parts.
  if (profile) {
    const fields = cleanProfileFields({
      first_name: profile.first_name,
      last_name: profile.last_name,
      nickname: profile.nickname,
      birthdate: profile.birthdate,
    });
    const { error } = await g.admin
      .from("v2_profiles")
      .update({
        first_name: fields.first_name,
        last_name: fields.last_name,
        nickname: fields.nickname,
        birthdate: fields.birthdate,
        display_name: displayNameFrom(fields),
        updated_at: new Date().toISOString(),
      })
      .eq("id", user_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

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
