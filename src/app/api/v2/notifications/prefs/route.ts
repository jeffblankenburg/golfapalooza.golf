import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgMember } from "@/lib/v2/orgs";
import { NOTIFICATION_PREF_KEYS } from "@/lib/v2/notification-prefs";

/**
 * Per-user notification preferences for an org (opt-out; missing row = enabled).
 *   GET ?orgId=       — { prefs: { <key>: boolean } } for every pref key
 *                        (push_master + each notification type).
 *   PUT { orgId, category, enabled } — upsert one toggle (`category` = a pref key).
 * Auth: bearer/cookie; org-membership gated.
 */
const VALID = new Set(NOTIFICATION_PREF_KEYS);

export async function GET(request: Request) {
  const orgId = new URL(request.url).searchParams.get("orgId");
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  const admin = v2AdminClient();
  if (!(await isOrgMember(admin, userId, orgId))) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const { data } = await admin
    .from("v2_notification_prefs")
    .select("category, enabled")
    .eq("org_id", orgId)
    .eq("user_id", userId);
  const overrides = new Map((data || []).map((r) => [r.category as string, r.enabled as boolean]));

  // Default every pref key to enabled; apply stored overrides.
  const prefs: Record<string, boolean> = {};
  for (const key of NOTIFICATION_PREF_KEYS) prefs[key] = overrides.get(key) ?? true;

  return NextResponse.json({ prefs });
}

export async function PUT(request: Request) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { orgId?: string; category?: string; enabled?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!body.orgId || !body.category || typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "orgId, category, enabled required" }, { status: 400 });
  }
  if (!VALID.has(body.category)) {
    return NextResponse.json({ error: "Unknown category" }, { status: 400 });
  }

  const admin = v2AdminClient();
  if (!(await isOrgMember(admin, userId, body.orgId))) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const { error } = await admin.from("v2_notification_prefs").upsert(
    {
      user_id: userId,
      org_id: body.orgId,
      category: body.category,
      enabled: body.enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,org_id,category" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
