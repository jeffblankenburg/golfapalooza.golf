import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin, isOrgMember } from "@/lib/v2/orgs";
import {
  FEATURE_BY_KEY,
  MAX_PINNED,
  resolveFeatures,
  type FeatureRow,
} from "@/lib/v2/features";

/**
 * The GROUP-level feature registry — features configured once for the whole org
 * (Articles, Music, Polls, My Rounds…). Stored as org-default rows (event_id
 * NULL). Event-scoped features live under .../events/[eventId]/features instead.
 *
 * GET — resolved group features (members can read for nav).
 * PUT — admins overwrite the org-default config for group-scoped features.
 */

async function loadOrgRows(admin: ReturnType<typeof v2AdminClient>, orgId: string) {
  const { data } = await admin
    .from("v2_event_features")
    .select(
      "feature_key, event_id, visibility, pinned, nav_order, label_override, public, availability, available_from, available_until",
    )
    .eq("org_id", orgId)
    .is("event_id", null);
  return (data as FeatureRow[] | null) ?? [];
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const admin = v2AdminClient();
  if (!(await isOrgMember(admin, userId, id))) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  // Resolve with no event scope ("") so only org-default rows apply.
  const resolved = resolveFeatures(await loadOrgRows(admin, id), "");
  return NextResponse.json({ features: resolved });
}

const VISIBILITIES = ["off", "everyone", "admins"];

interface FeatureInput {
  feature_key: string;
  visibility?: string;
  pinned?: boolean;
  nav_order?: number;
  label_override?: string | null;
  public?: boolean;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, id))) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  let body: { features?: FeatureInput[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const inputs = Array.isArray(body.features) ? body.features : [];

  const now = new Date().toISOString();
  const rows = [] as Record<string, unknown>[];
  let pinnedCount = 0;
  for (const inp of inputs) {
    const def = FEATURE_BY_KEY[inp.feature_key];
    if (!def) return NextResponse.json({ error: `Unknown feature: ${inp.feature_key}` }, { status: 400 });
    if (def.alwaysOn) return NextResponse.json({ error: `${def.label} is always on` }, { status: 400 });
    if (def.scope !== "group") {
      return NextResponse.json({ error: `${def.label} is configured per event` }, { status: 400 });
    }
    if (def.status !== "available") {
      return NextResponse.json({ error: `${def.label} isn't available yet` }, { status: 400 });
    }
    const visibility = VISIBILITIES.includes(inp.visibility || "") ? inp.visibility! : "off";
    const on = visibility !== "off";
    // Top-bar utilities (Music) are never pinned to the bottom bar.
    const pinned = on && !def.topbar && !!inp.pinned;
    if (pinned) pinnedCount += 1;
    rows.push({
      org_id: id,
      event_id: null,
      feature_key: inp.feature_key,
      visibility,
      pinned,
      nav_order: Number.isFinite(inp.nav_order) ? Math.trunc(inp.nav_order as number) : 0,
      label_override: inp.label_override?.trim() || null,
      public: visibility === "everyone" && !!inp.public,
      availability: "always",
      available_from: null,
      available_until: null,
      updated_at: now,
      updated_by: userId,
    });
  }

  if (pinnedCount > MAX_PINNED) {
    return NextResponse.json(
      { error: `You can pin at most ${MAX_PINNED} features to the bottom bar.` },
      { status: 400 },
    );
  }

  // Replace the org-default rows for exactly the keys we were given (the partial
  // unique index on event_id IS NULL can't be inferred by PostgREST upsert).
  if (rows.length) {
    const keys = rows.map((r) => r.feature_key as string);
    const { error: delErr } = await admin
      .from("v2_event_features")
      .delete()
      .eq("org_id", id)
      .is("event_id", null)
      .in("feature_key", keys);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
    const { error: insErr } = await admin.from("v2_event_features").insert(rows);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  const resolved = resolveFeatures(await loadOrgRows(admin, id), "");
  return NextResponse.json({ features: resolved });
}
