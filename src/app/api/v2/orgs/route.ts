import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";

/**
 * POST /api/v2/orgs — create a new organization (group).
 *
 * Any signed-in user may create a group. The creator becomes the sole member,
 * as `owner`; everyone else joins only by redeeming an invite (never open join).
 *
 * Auth accepts a bearer token (native) or the cookie session (web) via
 * v2GetUser. Writes use the service role because the first membership can't
 * satisfy the membership RLS policy until it exists (chicken-and-egg).
 */
export async function POST(request: Request) {
  const { userId } = await v2GetUser(request);
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { name?: string; primary_color?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const name = (body.name || "").trim();
  if (!name) {
    return NextResponse.json({ error: "Group name is required" }, { status: 400 });
  }
  if (name.length > 80) {
    return NextResponse.json({ error: "Group name is too long" }, { status: 400 });
  }
  const primaryColor =
    typeof body.primary_color === "string" && /^#[0-9a-fA-F]{6}$/.test(body.primary_color)
      ? body.primary_color
      : "#0a5c36";

  const admin = v2AdminClient();

  // The creator becomes a member, so they must already have a completed profile
  // with a real name (collected at signup). Never mint a nameless member here.
  const { data: profile } = await admin
    .from("v2_profiles")
    .select("first_name, last_name")
    .eq("id", userId)
    .maybeSingle();
  if (!profile || !(profile.first_name || "").trim() || !(profile.last_name || "").trim()) {
    return NextResponse.json(
      { error: "Add your name before creating a group." },
      { status: 400 }
    );
  }

  // Unique slug from the name.
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "group";
  let slug = base;
  for (let i = 2; i < 100; i++) {
    const { data: existing } = await admin
      .from("v2_organizations")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!existing) break;
    slug = `${base}-${i}`;
  }

  const { data: org, error: orgErr } = await admin
    .from("v2_organizations")
    .insert({ name, slug, primary_color: primaryColor, created_by: userId })
    .select("id, slug")
    .single();
  if (orgErr || !org) {
    return NextResponse.json(
      { error: orgErr?.message || "Could not create group" },
      { status: 500 }
    );
  }

  const { error: memberErr } = await admin.from("v2_memberships").insert({
    org_id: org.id,
    user_id: userId,
    role: "owner",
    status: "active",
  });
  if (memberErr) {
    await admin.from("v2_organizations").delete().eq("id", org.id);
    return NextResponse.json({ error: memberErr.message }, { status: 500 });
  }

  return NextResponse.json({ slug: org.slug, id: org.id });
}
